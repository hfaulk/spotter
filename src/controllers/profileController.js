import { getUserById } from "../models/userModel.js";
import { getSpotsByUser } from "../models/spotModel.js";
import { getUnitsBySpot, getUserCollection } from "../models/unitModel.js";
import supabase from "../config/supabase.js";

export const serveProfile = async (req, res) => {
  const userId = req.user.id;
  console.log("Profile userId:", userId);

  const { data: profile } = await getUserById(userId);
  const { data: spots } = await getSpotsByUser(userId);
  const { data: collection } = await getUserCollection(userId);

  console.log("Spots found:", spots?.length);
  console.log("Profile found:", profile?.username);

  const spotsWithImages = await Promise.all(
    (spots || []).map(async (spot) => {
      let spotData = { ...spot };

      // Add image URL
      if (spot.image_path) {
        const { data } = supabase.storage
          .from("spot-images")
          .getPublicUrl(spot.image_path);
        spotData.imageUrl = data.publicUrl;
      } else {
        spotData.imageUrl = null;
      }

      // Fetch and attach units for this spot
      const { data: unitData } = await getUnitsBySpot(spot.spot_id);
      spotData.units = unitData?.map((row) => row.unit) || [];

      return spotData;
    }),
  );

  const collectionWithCounts = (collection || []).map((item) => ({
    ...item.unit,
    times_spotted: item.times_spotted,
  }));

  res.render("profile", {
    profile,
    spots: spotsWithImages,
    collection: collectionWithCounts,
    activePage: "profile",
  });
};
