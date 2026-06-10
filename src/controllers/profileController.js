import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getUserById } from "../models/userModel.js";
import { getSpotsByUser } from "../models/spotModel.js";
import {
  getUnitsBySpot,
  getUserCollectionDetailed,
} from "../models/unitModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ===== ROSTER (Unit Collection §19) =====
// Loaded once at boot. Keys are "Class 08", "Class 350", etc.
let roster = {};
try {
  roster = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../../public/data/roster.json"),
      "utf8",
    ),
  );
} catch (err) {
  console.error("Could not load roster.json:", err.message);
}

// Lookup from class digits -> roster key, tolerant of leading zeros:
// "08" -> "Class 08", "8" -> "Class 08", "350" -> "Class 350"
const rosterLookup = {};
for (const key of Object.keys(roster)) {
  const digits = key.replace(/[^0-9]/g, "");
  rosterLookup[digits] = key;
  rosterLookup[String(parseInt(digits, 10))] = key;
}

// Work out which class a unit belongs to.
// 1) From the unit_class text ("CLASS 47", "Class 350", "350") — take the number.
// 2) Fall back to the unit number itself: 6 digits -> first 3 (EMU/DMU,
//    e.g. 350123 -> 350), 5 digits -> first 2 (locos, e.g. 47805 -> 47,
//    08123 -> 08).
const inferClassDigits = (unit) => {
  if (unit.unit_class) {
    const m = String(unit.unit_class).match(/\d{2,3}/);
    if (m) return m[0];
  }
  const num = String(unit.unit_number || "").replace(/\D/g, "");
  if (num.length === 6) return num.slice(0, 3);
  if (num.length === 5) return num.slice(0, 2);
  return null;
};

const buildClassCollection = (collection) => {
  const groups = {};

  for (const unit of collection) {
    const digits = inferClassDigits(unit);
    const rosterKey = digits
      ? rosterLookup[digits] || rosterLookup[String(parseInt(digits, 10))]
      : null;

    // Group key: prefer the canonical roster key, then raw digits, then Other
    const key = rosterKey || (digits ? `Class ${digits}` : "__other__");

    if (!groups[key]) {
      groups[key] = {
        classNum: rosterKey ? rosterKey.replace(/[^0-9]/g, "") : digits || null,
        total: rosterKey ? roster[rosterKey].fleet_size : null,
        units: [],
      };
    }

    groups[key].units.push({
      unit_id: unit.unit_id,
      unit_number: unit.unit_number,
      unit_operator: unit.unit_operator || null,
      times_spotted: unit.times_spotted,
      image: unit.latest_image_path
        ? `${process.env.R2_PUBLIC_URL}/${unit.latest_image_path}`
        : null,
    });
  }

  return Object.values(groups)
    .map((g) => ({
      ...g,
      spotted: g.units.length,
      units: g.units.sort((a, b) =>
        String(a.unit_number).localeCompare(String(b.unit_number)),
      ),
    }))
    .sort((a, b) => {
      // Most-spotted classes first; "Other" (no classNum) always last
      if (!a.classNum && b.classNum) return 1;
      if (a.classNum && !b.classNum) return -1;
      return b.spotted - a.spotted;
    });
};

export const serveProfile = async (req, res) => {
  const userId = req.user.id;

  const { data: profile } = await getUserById(userId);
  const { data: spots } = await getSpotsByUser(userId);
  const { data: collection } = await getUserCollectionDetailed(userId);

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

  const classCollection = buildClassCollection(collection || []);

  // Serialised for embedding in a <script> tag — escape "<" so user-entered
  // unit text can never break out of the script block (XSS).
  const collectionJson = JSON.stringify(classCollection).replace(
    /</g,
    "\\u003c",
  );

  res.render("profile", {
    profile,
    spots: spotsWithImages,
    collection: collection || [],
    classCollection,
    collectionJson,
    activePage: "profile",
  });
};
