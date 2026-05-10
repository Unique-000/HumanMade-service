import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const projectUrl = process.env.PROJECT_URL?.trim();
  const apiSecret = process.env.API_SECRET?.trim();

  if (!projectUrl || !apiSecret) {
    throw new Error("Missing PROJECT_URL or API_SECRET environment variables");
  }

  return createClient(projectUrl, apiSecret);
}

export default async function requireLogin(req, res, next) {
  try {
    const login = req.headers["x-login"];

    if (!login || login.length !== 16) {
      return res.status(401).send({ mess: "Missing or invalid login" });
    }

    const supabase = getSupabase();
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
