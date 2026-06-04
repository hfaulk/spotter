import supabase from "../config/supabase.js";

const formatHour = (h) => {
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}${ampm}`;
};

export const getHotspots = async () => {
  const { data: spots, error } = await supabase
    .from("spot")
    .select(
      "spot_id, spot_latitude, spot_longitude, spot_timestamp, image_path, user_id",
    )
    .not("spot_latitude", "is", null)
    .not("spot_longitude", "is", null);

  if (error) return { data: null, error };
  if (!spots?.length)
    return { data: { type: "FeatureCollection", features: [] }, error: null };

  // Group by ~200m grid
  const hotspotMap = {};
  for (const spot of spots) {
    const lat = Math.round(spot.spot_latitude / 0.002) * 0.002;
    const lon = Math.round(spot.spot_longitude / 0.002) * 0.002;
    const key = `${lat},${lon}`;
    if (!hotspotMap[key]) {
      hotspotMap[key] = {
        lat: spot.spot_latitude,
        lon: spot.spot_longitude,
        spots: [],
        users: new Set(),
      };
    }
    hotspotMap[key].spots.push(spot);
    hotspotMap[key].users.add(spot.user_id);
  }

  const features = await Promise.all(
    Object.values(hotspotMap).map(async (h) => {
      const sorted = [...h.spots].sort(
        (a, b) => new Date(b.spot_timestamp) - new Date(a.spot_timestamp),
      );
      const mostRecent = sorted[0];

      // Preview image
      let previewImage = null;
      if (mostRecent.image_path) {
        previewImage = `${process.env.R2_PUBLIC_URL}/${mostRecent.image_path}`;
      }

      // Best time of day
      const hourCounts = {};
      h.spots.forEach((s) => {
        const hr = new Date(s.spot_timestamp).getHours();
        hourCounts[hr] = (hourCounts[hr] || 0) + 1;
      });
      const bestHour = parseInt(
        Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0],
      );

      // Recent unique units
      const recentUnits = [];
      const unitsSeen = new Set();
      for (const spot of sorted) {
        if (recentUnits.length >= 5) break;
        const { data: spotUnits } = await supabase
          .from("spot_unit")
          .select("unit(unit_number, unit_class, unit_operator)")
          .eq("spot_id", spot.spot_id);

        spotUnits?.forEach((su) => {
          if (su.unit && !unitsSeen.has(su.unit.unit_number)) {
            unitsSeen.add(su.unit.unit_number);
            recentUnits.push(su.unit);
          }
        });
      }

      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [h.lon, h.lat],
        },
        properties: {
          spot_count: h.spots.length,
          spotter_count: h.users.size,
          preview_image: previewImage,
          best_time: `${formatHour(bestHour)}–${formatHour(bestHour + 1)}`,
          is_hotspot: h.spots.length > 1,
          recent_units: JSON.stringify(recentUnits),
        },
      };
    }),
  );

  return {
    data: { type: "FeatureCollection", features },
    error: null,
  };
};
