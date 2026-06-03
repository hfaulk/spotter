import supabase from "../config/supabase.js";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 1000, // 1 hour
};

const refreshCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30 * 1000, // 30 days
};

const setSessionCookies = (res, session) => {
  res.cookie("access_token", session.access_token, cookieOptions);
  res.cookie("refresh_token", session.refresh_token, refreshCookieOptions);
};

// ===== SERVE VIEWS =====
export const serveLogin = (req, res) => {
  const success =
    req.query.reset === "success"
      ? "Password reset successfully. Please log in."
      : undefined;
  res.render("auth/login", { success, error: undefined });
};
export const serveRegister = (req, res) => res.render("auth/register");

// ===== EMAIL AUTH =====
export const registerUser = async (req, res) => {
  const { first_name, last_name, username, email, password } = req.body;

  const { data: existing } = await supabase
    .from("user")
    .select("user_id")
    .eq("username", username)
    .single();

  if (existing) {
    return res.render("auth/register", {
      error: "That username is already taken",
      fields: { first_name, last_name, username, email },
    });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { first_name, last_name, username } },
  });

  if (error) {
    return res.render("auth/register", {
      error: error.message,
      fields: { first_name, last_name, username, email },
    });
  }

  if (!data.session) {
    return res.render("auth/register", {
      success: "Check your email to confirm your account before logging in.",
      fields: {},
    });
  }

  setSessionCookies(res, data.session);
  res.redirect("/profile");
};

export const loginUser = async (req, res) => {
  const { username, password } = req.body;

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

  setSessionCookies(res, data.session);
  res.redirect("/profile");
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
  const { access_token, refresh_token } = req.body;
  if (!access_token)
    return res.status(400).json({ error: "No token provided" });
  res.cookie("access_token", access_token, cookieOptions);
  if (refresh_token)
    res.cookie("refresh_token", refresh_token, refreshCookieOptions);
  res.json({ success: true });
};

// ===== SIGN OUT =====
export const signOut = (req, res) => {
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  res.redirect("/login");
};

// ===== PASSWORD RESET =====
export const serveForgotPassword = (req, res) => {
  res.render("auth/forgot-password", { sent: false, error: undefined });
};

export const submitForgotPassword = async (req, res) => {
  const { email } = req.body;

  // Look up user in our table to get their ID
  const { data: userData } = await supabase
    .from("user")
    .select("user_id")
    .eq("user_email", email)
    .single();

  if (userData) {
    // Check their auth providers
    const {
      data: { user },
    } = await supabase.auth.admin.getUserById(userData.user_id);
    const providers = user?.app_metadata?.providers || [];

    if (providers.includes("google") && !providers.includes("email")) {
      return res.render("auth/forgot-password", {
        sent: false,
        error:
          "This account uses Google sign-in. Please log in with Google instead.",
      });
    }
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.BASE_URL}/auth/reset-password`,
  });

  if (error) {
    return res.render("auth/forgot-password", {
      sent: false,
      error: error.message,
    });
  }

  res.render("auth/forgot-password", { sent: true, error: undefined });
};

export const serveResetPassword = (req, res) => {
  res.render("auth/reset-password", { error: undefined });
};

export const submitResetPassword = async (req, res) => {
  const { password, access_token } = req.body;

  if (!password || password.length < 8) {
    return res.render("auth/reset-password", {
      error: "Password must be at least 8 characters",
    });
  }

  if (!access_token) {
    return res.render("auth/reset-password", {
      error: "Invalid or expired reset link",
    });
  }

  // Get user from recovery token
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(access_token);

  if (userError || !user) {
    return res.render("auth/reset-password", {
      error: "Invalid or expired reset link",
    });
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password,
  });

  if (error) {
    return res.render("auth/reset-password", { error: error.message });
  }

  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  res.redirect("/login?reset=success");
};
