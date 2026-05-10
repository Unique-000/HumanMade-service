import express from "express"
import "dotenv/config.js";

import { createClient } from '@supabase/supabase-js'

const router = express.Router();

function getSupabase() {
  const projectUrl = process.env.PROJECT_URL?.trim();
  const apiSecret = process.env.API_SECRET?.trim();

  if (!projectUrl || !apiSecret) {
    throw new Error("Missing PROJECT_URL or API_SECRET environment variables");
  }

  return createClient(projectUrl, apiSecret);
}

function generateLogin() {
  let login = "";
  for (let i = 0; i < 16; i++) {
    login += Math.floor(Math.random() * 10);
  }
  return login;
}

async function loginExists(login) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("login")
    .eq("login", login)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function generateUniqueLogin() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const login = generateLogin();
    const exists = await loginExists(login);
    if (!exists) {
      return login;
    }
  }

  throw new Error("Could not generate a unique login");
}

router.get("/register/preview", async (req, res) => {
  try {
    const login = await generateUniqueLogin();
    return res.status(200).send({ login });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ mess: "Supabase DB error" });
  }
});


router.post("/register", async (req, res) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const login = req.body?.login ? String(req.body.login).trim() : await generateUniqueLogin();

    if (login.length !== 16) {
      return res.status(400).send({ mess: "Invalid login" });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("users")
      .insert({ login })
      .select("login")
      .single();

    if (!error) {
      return res.status(201).send({
        mess: "User created",
        login: data.login
      });
    }

    console.log(error);

    if (error.code !== "23505") {
      return res.status(500).send({ mess: "Supabase DB error" });
    }
  }

  return res.status(500).send({ mess: "Could not generate a unique login" });
});

router.post("/login", async (req, res) => { //checks if account exists
  if (req.body == undefined){
    return res.status(400).send({ mess: "Invalid login" });
  }
  if (req.body.login == undefined){
    return res.status(400).send({ mess: "Invalid login" });
  }
  const login = String(req.body.login).trim();
  if (login.length != 16){
    return res.status(400).send({ mess: "Invalid login" });
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("users")
      .select("login")
      .eq("login", login);

    if (error) {
      console.log(error);
      return res.status(500).send({ mess: "Supabase DB error" });
    }

    if (!data || data.length === 0) {
      return res.status(404).send({ mess: "User not found" });
    }

    res.status(200).send({ mess: "Logged in", login: data[0].login });
  } catch (err) {
    console.log(err)
    return res.status(500).send({ mess: "Supabase DB error" });
  }
})

export default router
