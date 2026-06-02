import supabase from "../config/supabase.js";

export const requireAuth = async (req, res, next) => {
  const token = req.cookies?.access_token;

  if (!token) return res.redirect("/login");

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return res.redirect("/login");

  req.user = user;
  next();
};
