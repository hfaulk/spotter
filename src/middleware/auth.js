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

export const requireAuth = async (req, res, next) => {
  const token = req.cookies?.access_token;
  const refreshToken = req.cookies?.refresh_token;

  if (!token && !refreshToken) return res.redirect("/login");

  // Try access token first
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (!error && user) {
    req.user = user;
    return next();
  }

  // Access token failed — try refreshing
  if (!refreshToken) {
    res.clearCookie("access_token");
    return res.redirect("/login");
  }

  const { data: refreshData, error: refreshError } =
    await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

  if (refreshError || !refreshData.session) {
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    return res.redirect("/login");
  }

  // Set new cookies with refreshed tokens
  res.cookie("access_token", refreshData.session.access_token, cookieOptions);
  res.cookie(
    "refresh_token",
    refreshData.session.refresh_token,
    refreshCookieOptions,
  );

  req.user = refreshData.user;
  next();
};

export const requireOnboarding = async (req, res, next) => {
  const { data, error } = await supabase
    .from("user")
    .select("username")
    .eq("user_id", req.user.id)
    .single();

  if (error || !data?.username) return res.redirect("/onboarding");

  next();
};
