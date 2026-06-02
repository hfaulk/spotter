import supabase from "../config/supabase.js";

// ===== SERVE VIEWS =====
export const serveLogin = (req, res) => res.render("auth/login");
export const serveRegister = (req, res) => res.render("auth/register");

// ===== EMAIL AUTH =====
export const registerUser = async (req, res) => {
  const { first_name, last_name, username, email, password } = req.body;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name, last_name, username },
    },
  });

  if (error) {
    return res.render("auth/register", {
      error: error.message,
      fields: { first_name, last_name, username, email },
    });
  }

  // No session means email already exists
  if (!data.session) {
    return res.render("auth/register", {
      error:
        "An account with this email already exists. Try signing in with Google instead.",
      fields: { first_name, last_name, username, email },
    });
  }

  res.cookie("access_token", data.session.access_token, {
    httpOnly: true,
    sameSite: "lax",
  });
  res.redirect("/dashboard");
};

export const loginUser = async (req, res) => {
  const { username, password } = req.body;

  // Look up email from username
  const { data: userData, error: lookupError } = await supabase
    .from("user")
    .select("user_email")
    .eq("username", username)
    .single();

  if (lookupError || !userData) {
    return res.render("auth/login", { error: "Username not found" });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: userData.user_email,
    password,
  });

  if (error) return res.render("auth/login", { error: "Invalid password" });

  res.cookie("access_token", data.session.access_token, {
    httpOnly: true,
    sameSite: "lax",
  });
  res.redirect("/dashboard");
};

// ===== GOOGLE AUTH =====
export const googleAuth = async (req, res) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.BASE_URL}/auth/callback`,
    },
  });

  if (error) return res.redirect("/login");
  res.redirect(data.url);
};

export const authCallback = (req, res) => {
  res.render("auth/callback");
};

export const setSession = (req, res) => {
  const { access_token } = req.body;
  if (!access_token)
    return res.status(400).json({ error: "No token provided" });
  res.cookie("access_token", access_token, { httpOnly: true, sameSite: "lax" });
  res.json({ success: true });
};

// ===== SIGN OUT =====
export const signOut = (req, res) => {
  res.clearCookie("access_token");
  res.redirect("/login");
};
