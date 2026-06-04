import { getUserById } from "../models/userModel.js";
import { getSpotsByUser } from "../models/spotModel.js";
import { getUnitsBySpot, getUserCollection } from "../models/unitModel.js";

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
      const imageUrl = spot.image_path
        ? `${process.env.R2_PUBLIC_URL}/${spot.image_path}`
        : null;
      spotData.imageUrl = imageUrl;

      // Fetch and attach units for this spot
      const { data: unitData } = await getUnitsBySpot(spot.spot_id);
      spotData.units = unitData?.map((row) => row.unit) || [];

      return spotData;
    }),
  );

  const collectionWithCounts = collection || [];

  res.render("profile", {
    profile,
    spots: spotsWithImages,
    collection: collectionWithCounts,
    activePage: "profile",
  });
};
