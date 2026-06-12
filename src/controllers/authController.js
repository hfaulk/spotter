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

// ===== FRIENDLY ERROR MAPPING (Gap 17.6) =====
// Supabase error strings are technical and inconsistent. Map them to
// human messages and insulate the app from Supabase wording changes.
const friendlyAuthError = (msg = "") => {
  const m = msg.toLowerCase();
  if (m.includes("already registered") || m.includes("already exists"))
    return "An account with that email already exists. Try logging in instead.";
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "Incorrect username or password.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email before logging in. Check your inbox.";
  if (m.includes("rate limit"))
    return "Too many attempts — please wait a few minutes and try again.";
  if (m.includes("password")) return "Password must be at least 8 characters.";
  return "Something went wrong — please try again.";
};

// ===== SERVE VIEWS =====
export const serveLogin = (req, res) => {
  // Map error flags passed via query params (Bug 17.3)
  const errorMap = {
    oauth_failed:
      "Google sign-in failed — please try again or use your email and password.",
  };
  const error = errorMap[req.query.error];

  const success =
    req.query.reset === "success"
      ? "Password reset successfully. Please log in."
      : req.query.deleted === "success"
        ? "Your account and all your data have been deleted. Goodbye 👋"
        : undefined;

  res.render("auth/login", { success, error });
};
export const serveRegister = (req, res) => res.render("auth/register");

// ===== EMAIL AUTH =====
export const registerUser = async (req, res) => {
  const { first_name, last_name, username, email, password } = req.body;

  // Bug 17.4: Supabase signUp deliberately does NOT error on duplicate
  // emails (anti-enumeration), it just returns session: null — which the
  // code below misreads as "needs email confirmation". Check our own user
  // table first so completed registrations get a clear error.
  const { data: existingEmail } = await supabase
    .from("user")
    .select("user_id")
    .eq("user_email", email)
    .single();

  if (existingEmail) {
    return res.render("auth/register", {
      error:
        "An account with that email already exists. Try logging in instead.",
      fields: { first_name, last_name, username, email },
    });
  }

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
      error: friendlyAuthError(error.message),
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
    return res.render("auth/login", {
      error: "Username not found",
      success: undefined,
    });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: userData.user_email,
    password,
  });

  if (error) {
    return res.render("auth/login", {
      error: friendlyAuthError(error.message),
      success: undefined,
    });
  }

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

  // Bug 17.3: surface the failure instead of silently bouncing to a blank login
  if (error) return res.redirect("/login?error=oauth_failed");
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
      error: friendlyAuthError(error.message),
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
    return res.render("auth/reset-password", {
      error: friendlyAuthError(error.message),
    });
  }

  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  res.redirect("/login?reset=success");
};
