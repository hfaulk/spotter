import supabase from "../config/supabase.js";

const formatHour = (h) => {
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}${ampm}`;
};

export const getHotspots = async (bounds) => {
  let query = supabase
    .from("spot")
    .select(
      "spot_id, spot_latitude, spot_longitude, spot_timestamp, image_path, user_id",
    )
    .not("spot_latitude", "is", null)
    .not("spot_longitude", "is", null);

  // If bounds are provided, filter the spots to only those visible on screen
  if (bounds && bounds.n && bounds.s && bounds.e && bounds.w) {
    query = query
      .lte("spot_latitude", parseFloat(bounds.n))
      .gte("spot_latitude", parseFloat(bounds.s))
      .lte("spot_longitude", parseFloat(bounds.e))
      .gte("spot_longitude", parseFloat(bounds.w));
  }

  const { data: spots, error } = await query;

  if (error) return { data: null, error };
  if (!spots?.length)
    return { data: { type: "FeatureCollection", features: [] }, error: null };

  // Fetch all units for these spots in a single query
  const spotIds = spots.map((s) => s.spot_id);
  const { data: allSpotUnits } = await supabase
    .from("spot_unit")
    .select("spot_id, unit(unit_number, unit_class, unit_operator)")
    .in("spot_id", spotIds);

  const unitsBySpot = {};
  if (allSpotUnits) {
    allSpotUnits.forEach(({ spot_id, unit }) => {
      if (!unitsBySpot[spot_id]) unitsBySpot[spot_id] = [];
      if (unit) unitsBySpot[spot_id].push(unit);
    });
  }

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

  // Build features synchronously using the pre-fetched unit map
  const features = Object.values(hotspotMap).map((h) => {
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
      const spotUnits = unitsBySpot[spot.spot_id] || [];

      spotUnits.forEach((unit) => {
        if (unit && !unitsSeen.has(unit.unit_number)) {
          unitsSeen.add(unit.unit_number);
          if (recentUnits.length < 5) {
            recentUnits.push(unit);
          }
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
  });

  return {
    data: { type: "FeatureCollection", features },
    error: null,
  };
};
