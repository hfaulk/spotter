import supabase from "../config/supabase.js";
import { getUserById } from "../models/userModel.js";
import { getHotspots } from "../models/mapModel.js";

export const serveMap = async (req, res) => {
  const token = req.cookies?.access_token;
  if (token) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await getUserById(user.id);
        res.locals.currentUser = profile;
        res.locals.authUser = user;
      }
    } catch {}
  }
  res.render("map", { activePage: "map" });
};

export const getMapData = async (req, res) => {
  // Grab the map boundaries from the URL query
  const bounds = {
    n: req.query.n,
    s: req.query.s,
    e: req.query.e,
    w: req.query.w,
  };

  const { data, error } = await getHotspots(bounds);
  if (error) return res.status(500).json({ error: "Failed to fetch map data" });
  res.json(data);
};
