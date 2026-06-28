import supabase from "../config/supabase.js";

// ===== VALIDATION RULES =====
// Shared constants so the same limits apply whether the user is onboarding
// or updating their profile via settings.
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const NAME_MAX = 50;

// Returns an error string, or null if the value is valid.
export const validateUsername = (raw) => {
  const v = (raw || "").trim();
  if (!v) return "Username is required";
  if (v.length < USERNAME_MIN)
    return `Username must be at least ${USERNAME_MIN} characters`;
  if (v.length > USERNAME_MAX)
    return `Username must be ${USERNAME_MAX} characters or fewer`;
  if (!USERNAME_REGEX.test(v))
    return "Username can only contain letters, numbers, and underscores";
  return null;
};

export const validateName = (raw, label) => {
  const v = (raw || "").trim();
  if (!v) return `${label} is required`;
  if (v.length > NAME_MAX)
    return `${label} must be ${NAME_MAX} characters or fewer`;
  return null;
};

export const serveOnboarding = async (req, res) => {
  const meta = req.user.user_metadata || {};

  res.render("onboarding", {
    prefill: {
      first_name: meta.given_name || meta.full_name?.split(" ")[0] || "",
      last_name:
        meta.family_name || meta.full_name?.split(" ").slice(1).join(" ") || "",
    },
    error: undefined,
  });
};

export const submitOnboarding = async (req, res) => {
  const { first_name, last_name } = req.body;
  const username = (req.body.username || "").trim();
  const userId = req.user.id;

  // Server-side validation
  const usernameError = validateUsername(username);
  if (usernameError) {
    return res.render("onboarding", {
      prefill: { first_name, last_name },
      error: usernameError,
    });
  }

  const firstNameError = validateName(first_name, "First name");
  if (firstNameError) {
    return res.render("onboarding", {
      prefill: { first_name, last_name },
      error: firstNameError,
    });
  }

  const lastNameError = validateName(last_name, "Last name");
  if (lastNameError) {
    return res.render("onboarding", {
      prefill: { first_name, last_name },
      error: lastNameError,
    });
  }

  // Check username not taken by someone ELSE
  const { data: existing } = await supabase
    .from("user")
    .select("user_id")
    .eq("username", username)
    .neq("user_id", userId)
    .single();

  if (existing) {
    return res.render("onboarding", {
      prefill: { first_name, last_name },
      error: "That username is already taken",
    });
  }

  const { error } = await supabase
    .from("user")
    .update({
      username,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
    })
    .eq("user_id", userId);

  if (error) {
    return res.render("onboarding", {
      prefill: { first_name, last_name },
      error: "Something went wrong, please try again",
    });
  }

  res.redirect("/profile");
};
