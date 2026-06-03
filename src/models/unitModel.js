import supabase from "../config/supabase.js";

export const findOrCreateUnit = async ({
  unit_number,
  unit_class,
  unit_operator,
}) => {
  // Check if unit already exists
  const { data: existing } = await supabase
    .from("unit")
    .select("*")
    .eq("unit_number", unit_number)
    .single();

  if (existing) return { data: existing, error: null };

  // Create new unit
  const { data, error } = await supabase
    .from("unit")
    .insert({
      unit_number,
      unit_class: unit_class || null,
      unit_operator: unit_operator || null,
    })
    .select()
    .single();

  return { data, error };
};

export const linkUnitToSpot = async (spotId, unitId) => {
  const { data, error } = await supabase
    .from("spot_unit")
    .insert({ spot_id: spotId, unit_id: unitId });

  return { data, error };
};

export const getUnitsBySpot = async (spotId) => {
  const { data, error } = await supabase
    .from("spot_unit")
    .select("unit(*)")
    .eq("spot_id", spotId);

  return { data, error };
};
