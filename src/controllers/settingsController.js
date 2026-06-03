import supabase from "../config/supabase.js";
import { getUserById, updateUser } from "../models/userModel.js";

export const serveSettings = async (req, res) => {
  const { data: profile } = await getUserById(req.user.id);
  res.render("settings", {
    profile,
    error: undefined,
    success: undefined,
    activePage: "settings",
  });
};

export const updateProfile = async (req, res) => {
  const { first_name, last_name, username } = req.body;
  const userId = req.user.id;

  const { data: existing } = await supabase
    .from("user")
    .select("user_id")
    .eq("username", username)
    .neq("user_id", userId)
    .single();

  if (existing) {
    const { data: profile } = await getUserById(userId);
    return res.render("settings", {
      profile,
      error: "That username is already taken",
      success: undefined,
      activePage: "settings",
    });
  }

  const { error } = await updateUser(userId, {
    first_name: first_name?.trim() || null,
    last_name: last_name?.trim() || null,
    username: username?.trim(),
  });

  const { data: profile } = await getUserById(userId);

  if (error) {
    return res.render("settings", {
      profile,
      error: "Failed to update profile, please try again",
      success: undefined,
      activePage: "settings",
    });
  }

  res.render("settings", {
    profile,
    error: undefined,
    success: "Profile updated",
    activePage: "settings",
  });
};
