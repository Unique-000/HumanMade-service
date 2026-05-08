import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.PROJECT_URL,
  process.env.API_SECRET
)

export default async function requireLogin(req, res, next) {
  try {
    const login = req.headers["x-login"];

    if (!login || login.length !== 16) {
      return res.status(401).send({ mess: "Missing or invalid login" });
    }

    const { data, error } = await supabase
      .from("users")
      .select("login")
      .eq("login", login)
      .single();

    if (error || !data) {
      return res.status(401).send({ mess: "Unauthorized" });
    }

    req.user = data;
    next();
  } catch (err) {
    console.log(err);
    return res.status(500).send({ mess: "Auth error" });
  }
}