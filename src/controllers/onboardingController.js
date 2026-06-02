import supabase from "../config/supabase.js";

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
  const { username, first_name, last_name } = req.body;
  const userId = req.user.id;

  // Check username is not taken
  const { data: existing } = await supabase
    .from("user")
    .select("user_id")
    .eq("username", username)
    .single();

  if (existing) {
    return res.render("onboarding", {
      prefill: { first_name, last_name },
      error: "That username is already taken",
    });
  }

  const { error } = await supabase
    .from("user")
    .update({ username, first_name, last_name })
    .eq("user_id", userId);

  if (error) {
    return res.render("onboarding", {
      prefill: { first_name, last_name },
      error: "Something went wrong, please try again",
    });
  }

  res.redirect("/dashboard");
};
