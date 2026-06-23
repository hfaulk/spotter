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

// ===== WIKIPEDIA API PROXY =====
// In-memory cache to prevent spamming Wikipedia.
// Resets when the server restarts, which is fine for Wikipedia summaries.
const wikiCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export const getWikiSummary = async (req, res) => {
  const { classNum } = req.params;
  if (!classNum) return res.status(400).json({ error: "Missing class number" });

  // 1. Check server-side cache first
  if (wikiCache.has(classNum)) {
    const cached = wikiCache.get(classNum);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      // Return cached data and tell the browser it can cache it too
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.json(cached.data);
    }
  }

  try {
    // 2. Fetch from Wikipedia with a compliant User-Agent
    const wikiRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/British_Rail_Class_${classNum}`,
      {
        headers: {
          // Wikimedia policy: <app name>/<version> (<contact info>)
          "User-Agent": "Lineside/1.0 (https://github.com/hfaulk/spotter)",
          Accept: "application/json",
        },
      },
    );

    if (!wikiRes.ok) {
      return res.status(wikiRes.status).json({ error: "Wikipedia API error" });
    }

    const data = await wikiRes.json();

    // 3. Save to memory cache
    wikiCache.set(classNum, {
      timestamp: Date.now(),
      data,
    });

    // 4. Send to client
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.json(data);
  } catch (err) {
    console.error(`Wikipedia proxy error for Class ${classNum}:`, err);
    res.status(500).json({ error: "Failed to fetch from Wikipedia" });
  }
};
