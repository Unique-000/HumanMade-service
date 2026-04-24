import express from "express"
import multer from "multer"
import crypto from "crypto";
import { imageHash } from "image-hash";
import fs from "fs"
import os from "os";
import path from "path"
import { createClient } from '@supabase/supabase-js'
import axios from "axios"

const supabase = createClient(
  process.env.PROJECT_URL,
  process.env.API_SECRET
)

const upload = multer({
  limits: {
    fileSize: 7 * 1024 * 1024, // 7MB limit
  },
});

const router = express.Router();

router.get("/:code", async (req, res) => { //return photos url and data based on code
  if (req.params['code'].length != 6){
    return res.status(400).send({ mess: 'Invalid photo code' });
  }
  const selectQuery = supabase
    .from("images")
    .select(`
      url,
      takenAt,
      localization,
      sha256,
      phash
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
      phash: data[0].phash
    }
    );
  }
  else {
    res.status(404).send({ mess: "Image not found" });
  }
})

router.post("/upload", upload.single("file"), async (req, res) => { //uploads image to blob and saves necessary data in db
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
    localization = await GetGeo(data[0].lat, data[0].lng)
  }
  const takenAt = null || req.body.takenAt;
  let url = "";
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
  try {
    code = await TryInsert({
      url,
      lat,
      lng,
      takenAt,
      sha256,
      phash,
      localization
    });
  } catch (err) {
    console.log(err)
    return res.status(500).send({ mess: "Supabase DB error" });
  }
  res.status(200).send({ mess: "Image added" });
})

router.post("/check", upload.single("file"), async (req, res) => { //checks if photo exists
  if (!req.file) {
    return res.status(400).send({ mess: 'No file attached' });
  }
  if (!req.file.mimetype.startsWith("image/jpeg")) {
    return res.status(400).send({ error: 'Wrong file format' });
  }
  const sha256 = sha256FromBuffer(req.file.buffer);
  const phash = await phashFromBuffer(req.file.buffer);
  let selectQuery = supabase
    .from("images")
    .select(`
      code,
      url
    `).eq("sha256", sha256)
  let { data: DBdata, error: DBerror } = await selectQuery;
  if (DBerror) {
    return res.status(500).send({ mess: 'Supabase DB error' });
  }
  if (DBdata.length > 0){
    return res.status(200).send(
      { 
        exactMatch: true,
        similarMatch: false,
        matches: [
          {
            code: DBdata[0].code,
            url: DBdata[0].url,
            localization: DBdata[0].localization,
            takenAt: DBdata[0].takenAt
          }
        ]
      }
    );
  }
  const { data, error } = await supabase.rpc(
    "find_similar_images",
    {
      input_phash: phash
    }
  );
  if (error) {
    console.error(error);
    return res.status(500).send({ mess: 'Supabase DB error' });
  }
  if (data.length > 0){
    let matches = [];
    for (const e of data) {
      matches.push({code: e.code, url: e.url, localization: e.localization})
    };
    return res.status(200).send(
      { 
        exactMatch: false,
        similarMatch: true,
        matches: matches
      }
    );
  }
  else{
    return res.status(200).send(
      { 
        mess: "No matches"
      }
    );
  }
})

async function GetGeo(lat, lon){
  const response = await axios.get('https://api.latlng.work/reverse', {
  params: {
   lat: lat,
    lon: lon
  },
    headers: {"X-Api-Key": process.env.API_GEO}
  })
  const loc = response.data.features[0].properties.country + ", " + response.data.features[0].properties.city;
  return loc;
}
async function TryInsert(data, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    const code = MakeCode(6);

    const { error } = await supabase
      .from("images")
      .insert({
        ...data,
        code: code
      });

    if (!error) {
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

function phashFromBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const filePath = bufferToTempFile(buffer);

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