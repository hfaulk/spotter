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
        const imageUrl = spot.image_path
          ? `${process.env.R2_PUBLIC_URL}/${spot.image_path}`
          : null;
        return { ...spot, imageUrl };
      }),
  );

  res.render("units/show", { unit, spots, activePage: "profile" });
};
