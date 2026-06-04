import supabase from "../config/supabase.js";
import { getUserById } from "../models/userModel.js";
import { getSpotsByUser } from "../models/spotModel.js";
import { getUnitsBySpot, getUserCollection } from "../models/unitModel.js";

export const serveProfile = async (req, res) => {
  const userId = req.user.id;
  console.log("Profile userId:", userId);

  const [{ data: profile }, { data: spots }, { data: collection }] =
    await Promise.all([
      getUserById(userId),
      getSpotsByUser(userId),
      getUserCollection(userId),
    ]);

  console.log("Spots found:", spots?.length);
  console.log("Profile found:", profile?.username);

  // Attach image URLs and units to each spot
  const spotsWithData = await Promise.all(
    (spots || []).map(async (spot) => {
      const { data: unitData } = await getUnitsBySpot(spot.spot_id);
      const units = unitData?.map((row) => row.unit) || [];

      let imageUrl = null;
      if (spot.image_path) {
        const { data } = supabase.storage
          .from("spot-images")
          .getPublicUrl(spot.image_path);
        imageUrl = data.publicUrl;
      }

      return { ...spot, units, imageUrl };
    }),
  );

  res.render("profile", {
    profile,
    spots: spotsWithData,
    collection: collection || [],
    activePage: "profile",
  });
};
