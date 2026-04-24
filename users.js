import express from "express"
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.PROJECT_URL,
  process.env.API_SECRET
)

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
  const { data, error } = await supabase
    .from("users")
    .insert({
      login: req.body.login
    });
  if(error) {
    console.log(error)
    if (error.code === "23505") {
      return res.status(500).send({ mess: "Supabase DB error [2]" });
    }
    else{
      return res.status(500).send({ mess: "Supabase DB error" });
    }
  }
  res.status(200).send({ mess: "User created" });
})

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
  const { data, error } = await supabase
    .from("users")
    .select("login")
    .eq("login", req.body.login);
  if (error){
    console.log(error)
    return res.status(500).send({ mess: "Supabase DB error" });
  }
  if (data.length == 0){
    return res.status(400).send({ mess: "Account has not been found" });
  }
  res.status(200).send({ mess: "Logged in" });
})

export default router