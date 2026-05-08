import express from "express"
import { createClient } from '@supabase/supabase-js'
import "dotenv/config.js";
import crypto from "crypto";

const supabase = createClient(
  process.env.PROJECT_URL,
  process.env.API_SECRET
)

const router = express.Router();



router.post("/register", async (req, res) => {
  // Generate a 16-digit numeric login
  let login = "";
  for (let i = 0; i < 16; i++) {
    login += Math.floor(Math.random() * 10);
  }

  const { data, error } = await supabase
    .from("users")
    .insert({ login })
    .select()
    .single();

  if (error) {
    console.log(error);

    if (error.code === "23505") {
      return res.status(500).send({ mess: "Collision occurred, retry" });
    }

    return res.status(500).send({ mess: "Supabase DB error" });
  }

  return res.status(201).send({
    mess: "User created",
    login: data.login
  });
});

router.post("/login", async (req, res) => { //checks if account exists
  if (req.body == undefined){
    return res.status(400).send({ mess: "Invalid login" });
  }
  if (req.body.login == undefined){
    return res.status(400).send({ mess: "Invalid login" });
  }
  if (req.body.login.length != 16){
    return res.status(400).send({ mess: "Invalid login" });
  }
  try {
    const { data, error } = await supabase
      .from("users")
      .select("login")
      .eq("login", req.body.login);

    if (error) {
      console.log(error);
      return res.status(500).send({ mess: "Supabase DB error" });
    }

    if (!data || data.length === 0) {
      return res.status(404).send({ mess: "User not found" });
    }

    res.status(200).send({ mess: "Logged in" });
  } catch (err) {
    console.log(err)
    return res.status(500).send({ mess: "Supabase DB error" });
  }
})

export default router
