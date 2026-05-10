import express from "express"
import multer from "multer"
import crypto from "crypto";
import { imageHash } from "image-hash";
import fs from "fs"
import os from "os";
import path from "path"
import { createClient } from '@supabase/supabase-js'
import axios from "axios"
import sharp from "sharp";
import "dotenv/config.js";
import requireLogin from "./middleware/requireLogin.js";
import { recordHashOnChain } from "./solana.js"

function getSupabase() {
  const projectUrl = process.env.PROJECT_URL?.trim();
  const apiSecret = process.env.API_SECRET?.trim();

  if (!projectUrl || !apiSecret) {
    throw new Error("Missing PROJECT_URL or API_SECRET environment variables");
  }

  return createClient(projectUrl, apiSecret);
}

const upload = multer({
  limits: {
    fileSize: 15 * 1024 * 1024, //15mb
  },
});



const router = express.Router();

router.get("/:code", async (req, res) => { //return photos url and data based on code
  if (req.params['code'].length != 6){
    return res.status(400).send({ mess: 'Invalid photo code' });
  }
  const supabase = getSupabase();
  const selectQuery = supabase
    .from("images")
    .select(`
      url,
      takenAt,
      localization,
      sha256,
      phash,
      txSignature
    `).eq("code", req.params['code'])
  const { data, error } = await selectQuery;
  if (error) {
    return res.status(500).send({ mess: 'Supabase DB error' });
  }
  if (data.length > 0){
    return res.status(200).send(
    { 
      url: data[0].url,
      takenAt: data[0].takenAt,
      localization: data[0].localization,
      sha256: data[0].sha256,
      phash: data[0].phash,
      txSignature: data[0].txSignature
    }
    );
  }
  else {
    res.status(404).send({ mess: "Image not found" });
  }
})

router.post("/upload", requireLogin, upload.single("file"), async (req, res) => { //uploads image to blob and saves necessary data in db
  if (!req.file) {
    return res.status(400).send({ mess: 'No file attached' });
  }
  if (!req.file.mimetype.startsWith("image/jpeg")) {
    return res.status(400).send({ error: 'Wrong file format' });
  }
  const uploadedFile = req.file;
  const lat = null || req.body.lat;
  const lng = null || req.body.lng;
  let localization = null;
  if (lat != null && lng != null){
    localization = await GetGeo(lat, lng);
  }
  const takenAt = null || req.body.takenAt;
  let url = "";
  const supabase = getSupabase();
  const filePath = crypto.randomUUID() + ".jpg"
  const { data, error } = await supabase.storage.from('images').upload(
  filePath, 
  uploadedFile.buffer,
  {
    contentType: uploadedFile.mimetype
  })
  if (error) {
    console.log(error)
    return res.status(500).send({ mess: 'Supabase blob error' });
  } else {
    const { data: urlData } = supabase.storage
    .from('images')
    .getPublicUrl(data.path)

    url = urlData.publicUrl
  }
  const sha256 = sha256FromBuffer(req.file.buffer);
  const phash = await phashFromBuffer(req.file.buffer);
  let code;
  const uuid = await crypto.randomUUID();
  try {
    code = await TryInsert({
      url,
      lat,
      lng,
      takenAt,
      sha256,
      phash,
      localization,
      uuid
    });
  } catch (err) {
    console.log(err)
    return res.status(500).send({ mess: "Supabase DB error" });
  }
  const { errorUser } = await supabase
  .rpc("increment_user_interaction", { p_login: req.user.login})
  if (errorUser){
    console.log(errorUser)
    return res.status(500).send({ mess: "Supabase db error"});
  }
  res.status(200).send({
  mess: "Image added",
  code
});
})

router.post("/check", upload.single("file"), async (req, res) => {
  // checks if photo exists
  if (!req.file) {
    return res.status(400).send({ mess: "No file attached" });
  }

  if (!req.file.mimetype.startsWith("image/jpeg")) {
    return res.status(400).send({ error: "Wrong file format" });
  }

  try {
    const supabase = getSupabase();
    const sha256 = sha256FromBuffer(req.file.buffer);
    const phash = await phashFromBuffer(req.file.buffer);

    // 1. Exact match (SHA256)
    const { data: DBdata, error: DBerror } = await supabase
      .from("images")
      .select(`
        code,
        url,
        localization,
        takenAt,
        sha256,
        phash,
        txSignature
      `)
      .eq("sha256", sha256);

    if (DBerror) {
      return res.status(500).send({ mess: "Supabase DB error" });
    }

    if (DBdata && DBdata.length > 0) {
      return res.status(200).send({
        exactMatch: true,
        similarMatch: false,
        matches: [
          {
            code: DBdata[0].code,
            url: DBdata[0].url,
            localization: DBdata[0].localization,
            takenAt: DBdata[0].takenAt,
            sha256: DBdata[0].sha256,
            phash: DBdata[0].phash,
            txSignature: DBdata[0].txSignature,
            distance: 0
          }
        ]
      });
    }

    // 2. Similar match (pHash)
    const { data, error } = await supabase.rpc("find_similar_images", {
      input_phash: phash
    });

    if (error) {
      console.error(error);
      return res.status(500).send({ mess: "Supabase DB error" });
    }

    if (data && data.length > 0) {
      const matchCodes = data.map((entry) => entry.code);
      const { data: enrichedMatches, error: enrichError } = await supabase
        .from("images")
        .select("code, url, localization, takenAt, sha256, phash, txSignature")
        .in("code", matchCodes);

      if (enrichError) {
        console.error(enrichError);
        return res.status(500).send({ mess: "Supabase DB error" });
      }

      const enrichedMap = new Map((enrichedMatches ?? []).map((entry) => [entry.code, entry]));

      const matches = data.map((entry) => {
        const fullEntry = enrichedMap.get(entry.code);
        return {
          code: entry.code,
          url: entry.url ?? fullEntry?.url,
          localization: entry.localization ?? fullEntry?.localization,
          takenAt: fullEntry?.takenAt,
          sha256: fullEntry?.sha256,
          phash: fullEntry?.phash,
          txSignature: fullEntry?.txSignature,
          distance: entry.distance
        };
      });

      return res.status(200).send({
        exactMatch: false,
        similarMatch: true,
        matches
      });
    }

    // 3. No matches
    return res.status(200).send({
      exactMatch: false,
      similarMatch: false,
      mess: "No matches"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).send({ mess: "Internal server error" });
  }
});


async function GetGeo(lat, lon) {

  try {
    const response = await axios.get(
      "https://api.bigdatacloud.net/data/reverse-geocode",
      {
        params: {
          latitude: lat,
          longitude: lon,
          key: process.env.API_GEO,   // ✅ key goes here
          localityLanguage: "en"
        }
      }
    );

    const data = response.data;

    const country = data.countryName || "";
    const city =
      data.city ||
      data.locality ||
      data.principalSubdivision ||
      "";

    const loc = [country, city].filter(Boolean).join(", ");
    return loc || "unknown location";
  } catch (err) {
    console.error("Geo error:", err.response?.data || err.message);
    return "unknown location";
    
  }
}

async function TryInsert(data, maxRetries = 5) {
  const supabase = getSupabase();
  for (let i = 0; i < maxRetries; i++) {
    const code = MakeCode(6);

    const { error } = await supabase
      .from("images")
      .insert({
        ...data,
        code: code
      });

    if (!error) {
      const sha256 = data.sha256;
      const phash = data.phash;
      const txSignature = await recordHashOnChain({ sha256, phash, code });
      const { errorSignature } = await supabase
      .from("images")
      .update({
        txSignature: txSignature
      })
      .eq("uuid", data.uuid);
      return code;
    }

    if (error.code === "23505") {
      continue;
    }
  }

}

function MakeCode(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function bufferToTempFile(buffer) {
  const tmpPath = path.join(os.tmpdir(), crypto.randomUUID() + ".jpg");
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

async function phashFromBuffer(buffer) {
  const normalized = await sharp(buffer)
    .rotate()
    .toBuffer();
    
  const filePath = bufferToTempFile(normalized);
  return new Promise((resolve, reject) => {
      imageHash(filePath, 16, true, (err, data) => {
        fs.unlinkSync(filePath);
        if (err) return reject(err);
        resolve(data);
    });
  });
}

function sha256FromBuffer(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

export default router;
