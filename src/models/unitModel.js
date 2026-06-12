import supabase from "../config/supabase.js";

export const findOrCreateUnit = async ({
  unit_number,
  unit_class,
  unit_operator,
}) => {
  const { data: existing } = await supabase
    .from("unit")
    .select("*")
    .eq("unit_number", unit_number)
    .single();

  if (existing) return { data: existing, error: null };

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

export const getUserCollection = async (userId) => {
  // Get all spot_units joined through the user's spots
  const { data, error } = await supabase
    .from("spot_unit")
    .select("unit(*), spot!inner(user_id)")
    .eq("spot.user_id", userId);

  if (error) return { data: null, error };

  // Aggregate unit counts
  const unitMap = {};
  data?.forEach((row) => {
    const unit = row.unit;
    if (!unitMap[unit.unit_id]) {
      unitMap[unit.unit_id] = { ...unit, times_spotted: 0 };
    }
    unitMap[unit.unit_id].times_spotted++;
  });

  const collection = Object.values(unitMap).sort(
    (a, b) => b.times_spotted - a.times_spotted,
  );

  return { data: collection, error: null };
};

// ===== UNIT COLLECTION (§19) =====
// Same as getUserCollection, but also attaches the image AND the spot id
// from the user's MOST RECENT spot of each unit — the collection tiles
// use the image, and tapping a tile jumps straight to that spot.
export const getUserCollectionDetailed = async (userId) => {
  const { data, error } = await supabase
    .from("spot_unit")
    .select(
      "unit(*), spot!inner(spot_id, user_id, spot_timestamp, image_thumb_path, image_path)",
    )
    .eq("spot.user_id", userId);

  if (error) return { data: null, error };

  const unitMap = {};
  data?.forEach((row) => {
    const unit = row.unit;
    const spot = row.spot;
    if (!unit) return;

    if (!unitMap[unit.unit_id]) {
      unitMap[unit.unit_id] = {
        ...unit,
        times_spotted: 0,
        latest_spot_ts: 0,
        latest_image_path: null,
        latest_spot_id: null,
      };
    }

    const u = unitMap[unit.unit_id];
    u.times_spotted++;

    const ts = spot?.spot_timestamp
      ? new Date(spot.spot_timestamp).getTime()
      : 0;
    if (ts >= u.latest_spot_ts) {
      u.latest_spot_ts = ts;
      u.latest_spot_id = spot.spot_id || u.latest_spot_id;
      u.latest_image_path =
        spot.image_thumb_path || spot.image_path || u.latest_image_path;
    }
  });

  const collection = Object.values(unitMap).sort(
    (a, b) => b.times_spotted - a.times_spotted,
  );

  return { data: collection, error: null };
};

export const getUnitById = async (unitId) => {
  const { data, error } = await supabase
    .from("unit")
    .select("*")
    .eq("unit_id", unitId)
    .single();

  return { data, error };
};

export const getSpotsByUnit = async (unitId, userId) => {
  const { data, error } = await supabase
    .from("spot_unit")
    .select("spot(*)")
    .eq("unit_id", unitId)
    .eq("spot.user_id", userId);

  return { data, error };
};
