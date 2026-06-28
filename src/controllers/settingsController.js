import supabase from "../config/supabase.js";
import { getUserById, updateUser } from "../models/userModel.js";
import { getSpotsByUser, deleteSpot } from "../models/spotModel.js";
import { validateUsername, validateName } from "./onboardingController.js";

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
  const { first_name, last_name } = req.body;
  const username = (req.body.username || "").trim();
  const userId = req.user.id;

  const renderWithError = async (error) => {
    const { data: profile } = await getUserById(userId);
    return res.render("settings", {
      profile,
      error,
      success: undefined,
      activePage: "settings",
    });
  };

  // Server-side validation (same rules as onboarding)
  const usernameError = validateUsername(username);
  if (usernameError) return renderWithError(usernameError);

  const firstNameError = validateName(first_name, "First name");
  if (firstNameError) return renderWithError(firstNameError);

  const lastNameError = validateName(last_name, "Last name");
  if (lastNameError) return renderWithError(lastNameError);

  const { data: existing } = await supabase
    .from("user")
    .select("user_id")
    .eq("username", username)
    .neq("user_id", userId)
    .single();

  if (existing) return renderWithError("That username is already taken");

  const { error } = await updateUser(userId, {
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    username,
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

// ===== ACCOUNT DELETION (GDPR right to erasure) =====
// Removes, in order: every spot (incl. spot_unit links + R2 images, via
// the existing deleteSpot path), the profile row, then the Supabase auth
// user. Order matters: if anything fails partway, the auth user still
// exists, so the person can log in and retry — no orphaned login.
export const deleteAccount = async (req, res) => {
  const userId = req.user.id;

  const renderError = async () => {
    const { data: profile } = await getUserById(userId);
    return res.render("settings", {
      profile,
      error:
        "Account deletion failed partway — please try again, or contact us if it keeps happening.",
      success: undefined,
      activePage: "settings",
    });
  };

  try {
    // 1. Delete all spots (handles spot_unit rows + both R2 images each)
    const { data: spots } = await getSpotsByUser(userId);
    for (const spot of spots || []) {
      const { error } = await deleteSpot(spot.spot_id, userId);
      if (error) {
        console.error(
          "deleteAccount: spot deletion failed",
          spot.spot_id,
          error,
        );
        return renderError();
      }
    }

    // 2. Delete the profile row
    const { error: userRowError } = await supabase
      .from("user")
      .delete()
      .eq("user_id", userId);
    if (userRowError) {
      console.error("deleteAccount: user row deletion failed", userRowError);
      return renderError();
    }

    // 3. Delete the auth user (last, so a partial failure is recoverable)
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("deleteAccount: auth deletion failed", authError);
      // Profile row is gone but login still works — requireOnboarding will
      // route them to onboarding; surface the error so they retry.
      return renderError();
    }

    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    res.redirect("/login?deleted=success");
  } catch (err) {
    console.error("deleteAccount error:", err);
    return renderError();
  }
};
