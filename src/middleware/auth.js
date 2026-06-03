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

export const requireAuth = async (req, res, next) => {
  const token = req.cookies?.access_token;
  const refreshToken = req.cookies?.refresh_token;

  if (!token && !refreshToken) return res.redirect("/login");

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (!error && user) {
    req.user = user;
    const { data: profile } = await getUserById(user.id);
    res.locals.currentUser = profile;
    res.locals.authUser = user;
    return next();
  }

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
  const profile = res.locals.currentUser;
  if (!profile?.username) return res.redirect("/onboarding");
  next();
};
