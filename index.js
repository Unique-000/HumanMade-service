import express from "express"
import path from "path"
import { createClient } from '@supabase/supabase-js'
import crypto from "crypto";
import multer from "multer"
import { imageHash } from "image-hash";
import fs from "fs"
import os from "os";
import rateLimit from "express-rate-limit";

const supabase = createClient(
  process.env.PROJECT_URL,
  process.env.API_SECRET
)

const app = express();
const PORT = process.env.PORT || 5000;

const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
	standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
	ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
})

app.use(limiter)

const upload = multer({
  limits: {
    fileSize: 7 * 1024 * 1024, // 7MB limit
  },
});

app.get("/api", (req, res) => {
  res.send({
    mess: "API works!"
  })
})

app.get("/api/images/:code", async (req, res) => { //return photos ulr and data based on code
  if (req.params['code'].length != 6){
    return res.status(400).send({ mess: 'Invalid photo code' });
  }
  const selectQuery = supabase
    .from("images")
    .select(`
      url,
      lat, 
      lng,
      takenAt
    `).eq("code", req.params['code'])
  const { data, error } = await selectQuery;
  if (error) {
    return res.status(500).send({ mess: 'Supabase DB error' });
  }
  if (data.length > 0){
    return res.status(200).send(
      { 
        url: data[0].url,
        lat: data[0].lat,
        lng: data[0].lng,
        takenAt: data[0].takenAt
      }
    );
  }
  else {
    res.status(404).send({ mess: "Image not found" });
  }
})

app.post("/api/images/upload", upload.single("file"), async (req, res) => { //uploads image to blob and saves necessary data in db
  if (!req.file) {
    return res.status(400).send({ mess: 'No file attached' });
  }
  if (!req.file.mimetype.startsWith("image/jpeg")) {
    return res.status(400).send({ error: 'Wrong file format' });
  }
  const uploadedFile = req.file;
  const lat = null || req.body.lat;
  const lng = null || req.body.lng;
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
      phash
    });
  } catch (err) {
    console.log(err)
    return res.status(500).send({ mess: "Supabase DB error" });
  }
  res.status(200).send({ mess: "Image added" });
})

app.post("/api/images/check", upload.single("file"), async (req, res) => { //checks if photo exists
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
  console.log(data)
  if (data.length > 0){
    let matches = [];
    data.forEach(e => {
      matches.push({code: e.code, url: e.url})
    });
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

const server = app.listen(PORT, () => {
  console.log("server is running on port", server.address().port);
});