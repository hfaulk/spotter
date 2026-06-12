import supabase from "../config/supabase.js";
import { getUserById } from "../models/userModel.js";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 1000,
};

const refreshCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30 * 1000,
};

const getUser = async (token) => {
  const result = await supabase.auth.getUser(token);
  if (!result.error && result.data.user) return result.data.user;

  // Brief pause then retry once — handles race condition on fresh tokens
  await new Promise((r) => setTimeout(r, 150));
  const retry = await supabase.auth.getUser(token);
  if (!retry.error && retry.data.user) return retry.data.user;
  return null;
};

// fetch() callers (spot sheet, delete buttons) need a 401 they can react
// to — following a 302 to /login just hands them an HTML page and breaks
// their JSON parsing.
const wantsJson = (req) =>
  req.headers["x-requested-with"] === "fetch" ||
  req.headers.accept?.includes("application/json");

const denyAuth = (req, res) =>
  wantsJson(req)
    ? res.status(401).json({ success: false, error: "Session expired" })
    : res.redirect("/login");

export const requireAuth = async (req, res, next) => {
  const token = req.cookies?.access_token;
  const refreshToken = req.cookies?.refresh_token;

  if (!token && !refreshToken) return denyAuth(req, res);

  const user = await getUser(token);

  if (user) {
    req.user = user;
    const { data: profile } = await getUserById(user.id);
    res.locals.currentUser = profile;
    res.locals.authUser = user;
    return next();
  }

  if (!refreshToken) {
    res.clearCookie("access_token");
    return denyAuth(req, res);
  }

  const { data: refreshData, error: refreshError } =
    await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

  if (refreshError || !refreshData.session) {
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    return denyAuth(req, res);
  }

  res.cookie("access_token", refreshData.session.access_token, cookieOptions);
  res.cookie(
    "refresh_token",
    refreshData.session.refresh_token,
    refreshCookieOptions,
  );

  req.user = refreshData.user;
  const { data: profile } = await getUserById(refreshData.user.id);
  res.locals.currentUser = profile;
  res.locals.authUser = refreshData.user;
  next();
};

export const requireOnboarding = (req, res, next) => {
  if (!res.locals.currentUser?.username) return res.redirect("/onboarding");
  next();
};
