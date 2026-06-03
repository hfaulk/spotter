import supabase from "../config/supabase.js";

export const getUserById = async (userId) => {
  const { data, error } = await supabase
    .from("user")
    .select("*")
    .eq("user_id", userId)
    .single();

  return { data, error };
};

export const updateUser = async (userId, updates) => {
  const { data, error } = await supabase
    .from("user")
    .update(updates)
    .eq("user_id", userId)
    .select()
    .single();

  return { data, error };
};
