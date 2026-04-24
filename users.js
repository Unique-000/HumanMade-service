import express from "express"
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.PROJECT_URL,
  process.env.API_SECRET
)
//f
const router = express.Router();

router.post("/register", async (req, res) => { //creates a new user
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
    await supabase
      .from("users")
      .insert({
        login: req.body.login
      });
  } catch (err) {
    console.log(err)
    return res.status(500).send({ mess: "Supabase DB error" });
  }
  res.status(200).send({ mess: "User created" });
})

router.get("/login", async (req, res) => { //checks if account exists
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
    await supabase
      .from("users")
      .select("login")
      .eq("login", req.body.login);
  } catch (err) {
    console.log(err)
    return res.status(500).send({ mess: "Supabase DB error" });
  }
  res.status(200).send({ mess: "Logged in" });
})

export default router