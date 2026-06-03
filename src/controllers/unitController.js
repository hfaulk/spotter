import supabase from "../config/supabase.js";
import { getUnitById, getSpotsByUnit } from "../models/unitModel.js";

export const showUnit = async (req, res) => {
  const { unitId } = req.params;
  const userId = req.user.id;

  const { data: unit, error } = await getUnitById(unitId);

  if (error || !unit) return res.redirect("/profile");

  const { data: spotData } = await getSpotsByUnit(unitId, userId);

  const spots = await Promise.all(
    (spotData || [])
      .filter((row) => row.spot)
      .map(async (row) => {
        const spot = row.spot;
        let imageUrl = null;
        if (spot.image_path) {
          const { data } = supabase.storage
            .from("spot-images")
            .getPublicUrl(spot.image_path);
          imageUrl = data.publicUrl;
        }
        return { ...spot, imageUrl };
      }),
  );

  res.render("units/show", { unit, spots, activePage: "profile" });
};
