import multer from "multer";
import exifr from "exifr";
import heicConvert from "heic-convert";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import r2 from "../config/r2.js";
import {
  createSpot,
  getSpotById,
  getSpotByShareToken,
  deleteStorageImage,
  deleteSpot,
} from "../models/spotModel.js";
import {
  findOrCreateUnit,
  linkUnitToSpot,
  getUnitsBySpot,
} from "../models/unitModel.js";

// ===== MULTER CONFIG =====
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/heic",
    "image/heif",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG and HEIC images are allowed"), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Cache for duplicate submission prevention (18.4)
const recentNonces = new Set();

// ===== SERVE VIEWS =====
export const serveNewSpot = (req, res) => {
  res.render("spots/new", { error: undefined });
};

// ===== CREATE SPOT =====
export const createSpotController = async (req, res) => {
  const userId = req.user.id;
  let imagePath = null;

  try {
    const {
      spot_title,
      spot_description,
      spot_latitude,
      spot_longitude,
      spot_timestamp,
      submission_nonce,
    } = req.body;

    // 18.4 Check for exact duplicate submission
    if (submission_nonce && recentNonces.has(submission_nonce)) {
      return res.redirect("/profile");
    }

    if (!spot_title?.trim()) {
      return res.render("spots/new", { error: "A title is required" });
    }

    // 18.2 Server-side bounds validation
    if (
      spot_latitude &&
      (parseFloat(spot_latitude) < -90 || parseFloat(spot_latitude) > 90)
    ) {
      return res.render("spots/new", { error: "Invalid latitude provided" });
    }
    if (
      spot_longitude &&
      (parseFloat(spot_longitude) < -180 || parseFloat(spot_longitude) > 180)
    ) {
      return res.render("spots/new", { error: "Invalid longitude provided" });
    }

    const units = parseUnits(req.body);
    if (units.length === 0) {
      return res.render("spots/new", {
        error: "At least one unit is required",
      });
    }

    // ===== EXIF EXTRACTION =====
    let exifData = {};
    if (req.file) {
      try {
        const raw = await exifr.parse(req.file.buffer, {
          tiff: true,
          exif: true,
          gps: true,
          ifd0: true,
        });
        if (raw) {
          exifData = {
            image_shutter_speed: raw.ExposureTime
              ? formatShutterSpeed(raw.ExposureTime)
              : null,
            image_aperture: raw.FNumber ? `f/${raw.FNumber}` : null,
            image_iso: raw.ISOSpeedRatings || raw.ISO || null,
            image_focal_length: raw.FocalLength ? `${raw.FocalLength}mm` : null,
            image_camera: raw.Model || null,
          };
        }
      } catch {
        // EXIF extraction failed — continue without it
      }
    }

    // ===== CONVERT HEIC =====
    let fileBuffer = req.file?.buffer;
    let fileMimeType = req.file?.mimetype;

    if (fileMimeType === "image/heic" || fileMimeType === "image/heif") {
      try {
        const converted = await heicConvert({
          buffer: fileBuffer,
          format: "JPEG",
          quality: 0.9,
        });
        fileBuffer = Buffer.from(converted);
        fileMimeType = "image/jpeg";
      } catch (err) {
        console.error("HEIC conversion error:", err);
        return res.render("spots/new", {
          error: "Could not process HEIC image, please try again",
        });
      }
    }

    // ===== PHOTO UPLOAD =====
    if (req.file) {
      const ext = fileMimeType === "image/png" ? "png" : "jpg";
      imagePath = `${userId}/${Date.now()}.${ext}`;

      try {
        await r2.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: imagePath,
            Body: fileBuffer,
            ContentType: fileMimeType,
          }),
        );
      } catch (uploadError) {
        console.error("R2 upload error:", uploadError);
        return res.render("spots/new", {
          error: "Photo upload failed, please try again",
        });
      }
    }

    // ===== RESOLVE TIMESTAMP =====
    const timestamp = spot_timestamp
      ? new Date(spot_timestamp).toISOString()
      : new Date().toISOString();

    // ===== CREATE SPOT =====
    const { data: spot, error: spotError } = await createSpot({
      user_id: userId,
      spot_title: spot_title.trim(),
      spot_description: spot_description?.trim() || null,
      spot_latitude: spot_latitude ? parseFloat(spot_latitude) : null,
      spot_longitude: spot_longitude ? parseFloat(spot_longitude) : null,
      spot_timestamp: timestamp,
      image_path: imagePath,
      ...exifData,
    });

    if (spotError) {
      if (imagePath) await deleteStorageImage(imagePath);
      return res.render("spots/new", {
        error: "Failed to save spot, please try again",
      });
    }

    // ===== LINK UNITS (18.3 Transaction Cleanup) =====
    try {
      for (const unit of units) {
        const { data: unitData, error: unitError } =
          await findOrCreateUnit(unit);
        if (unitError) throw unitError;
        await linkUnitToSpot(spot.spot_id, unitData.unit_id);
      }
    } catch (linkErr) {
      // Revert the whole operation if linking fails
      await deleteSpot(spot.spot_id, userId);
      return res.render("spots/new", {
        error: "Failed to link units, please try again",
      });
    }

    // Cache nonce to prevent double execution
    if (submission_nonce) {
      recentNonces.add(submission_nonce);
      setTimeout(() => recentNonces.delete(submission_nonce), 30000);
    }

    res.redirect(`/spots/${spot.spot_id}`);
  } catch (err) {
    // 18.8 Orphaned R2 image cleanup
    if (imagePath) {
      await deleteStorageImage(imagePath).catch((e) =>
        console.error("Cleanup failed:", e),
      );
    }
    console.error("createSpot error:", err);
    res.render("spots/new", {
      error: "Something went wrong, please try again",
    });
  }
};

// ===== SHOW SPOT =====
export const showSpot = async (req, res) => {
  const { spotId } = req.params;
  const userId = req.user.id;

  const { data: spot, error } = await getSpotById(spotId, userId);
  if (error || !spot) return res.redirect("/profile");

  const { data: unitData } = await getUnitsBySpot(spotId);
  const units = unitData?.map((row) => row.unit) || [];

  const imageUrl = spot.image_path
    ? `${process.env.R2_PUBLIC_URL}/${spot.image_path}`
    : null;

  res.render("spots/show", { spot, units, imageUrl });
};

// ===== SHOW SHARED SPOT =====
export const showSharedSpot = async (req, res) => {
  const { token } = req.params;

  const { data: spot, error } = await getSpotByShareToken(token);
  if (error || !spot) return res.redirect("/");

  const { data: unitData } = await getUnitsBySpot(spot.spot_id);
  const units = unitData?.map((row) => row.unit) || [];

  const imageUrl = spot.image_path
    ? `${process.env.R2_PUBLIC_URL}/${spot.image_path}`
    : null;

  res.render("spots/show-shared", { spot, units, imageUrl });
};

// ===== DELETE SPOT =====
export const deleteSpotController = async (req, res) => {
  const { spotId } = req.params;
  const userId = req.user.id;

  const { error } = await deleteSpot(spotId, userId);

  if (error) {
    console.error("Delete spot error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to delete spot" });
  }

  res.json({ success: true });
};

// ===== HELPERS =====
const parseUnits = (body) => {
  const units = [];
  const numbers = [].concat(body["unit_number"] || []);
  const classes = [].concat(body["unit_class"] || []);
  const operators = [].concat(body["unit_operator"] || []);

  for (let i = 0; i < numbers.length; i++) {
    const number = numbers[i]?.trim();
    if (!number) continue;
    units.push({
      unit_number: number,
      unit_class: classes[i]?.trim() || null,
      unit_operator: operators[i]?.trim() || null,
    });
  }

  return units;
};

const formatShutterSpeed = (exposureTime) => {
  if (exposureTime >= 1) return `${exposureTime}s`;
  return `1/${Math.round(1 / exposureTime)}`;
};
