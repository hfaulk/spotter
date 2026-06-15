import multer from "multer";
import exifr from "exifr";
import heicConvert from "heic-convert";
import sharp from "sharp";
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

// ===== VALIDATION HELPER (18.2) =====
const validate = (rules, body) => {
  const errors = [];
  for (const [field, checks] of Object.entries(rules)) {
    const val = body[field];
    if (checks.required && (!val || !val.toString().trim()))
      errors.push(`${field} is required`);
    if (checks.maxLength && val?.length > checks.maxLength)
      errors.push(`${field} must be under ${checks.maxLength} characters`);
    if (checks.pattern && val && !checks.pattern.test(val))
      errors.push(`${field} contains invalid characters`);
    if (checks.min !== undefined && Number(val) < checks.min)
      errors.push(`${field} is out of range`);
    if (checks.max !== undefined && Number(val) > checks.max)
      errors.push(`${field} is out of range`);
  }
  return errors;
};

// Basic XSS mitigation to strip potential HTML tags
const sanitize = (str) =>
  typeof str === "string" ? str.replace(/[<>]/g, "") : str;

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
  limits: { fileSize: 20 * 1024 * 1024 }, // Allowed up to 20MB initially, we compress later
});

// Cache for duplicate submission prevention (18.4)
// Note: This in-memory Set will not persist across horizontal scaling or restarts.
// Consider Redis or an external DB queue for multi-instance deployments.
const recentNonces = new Set();

// The global spot sheet submits via fetch and wants JSON back;
// the /spots/new fallback page still uses classic form posts.
const wantsJson = (req) =>
  req.headers["x-requested-with"] === "fetch" ||
  req.headers.accept?.includes("application/json");

// ===== SERVE VIEWS =====
export const serveNewSpot = (req, res) => {
  res.render("spots/new", { error: undefined });
};

// ===== CREATE SPOT =====
export const createSpotController = async (req, res) => {
  const userId = req.user.id;
  const isAjax = wantsJson(req);
  let imagePath = null;
  let thumbPath = null;

  // One place to report failures in whichever format the client expects
  const fail = (message, status = 400) =>
    isAjax
      ? res.status(status).json({ success: false, error: message })
      : res.render("spots/new", { error: message });

  try {
    const { spot_latitude, spot_longitude, spot_timestamp, submission_nonce } =
      req.body;

    // Sanitize strings
    const spot_title = sanitize(req.body.spot_title);
    const spot_description = sanitize(req.body.spot_description);

    // 18.4 Check for exact duplicate submission
    if (submission_nonce && recentNonces.has(submission_nonce)) {
      return isAjax
        ? res.json({ success: true, duplicate: true })
        : res.redirect("/profile");
    }

    // 18.2 Server-side bounds validation
    const validationErrors = validate(
      {
        spot_title: { required: true, maxLength: 200 },
        spot_latitude: { min: -90, max: 90 },
        spot_longitude: { min: -180, max: 180 },
      },
      { ...req.body, spot_title, spot_description },
    );

    if (validationErrors.length) {
      return fail(validationErrors[0]);
    }

    const units = parseUnits(req.body);
    if (units.length === 0) {
      return fail("At least one unit is required");
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
            image_camera: sanitize(raw.Model) || null,
          };
        }
      } catch {
        // EXIF extraction failed — continue without it
      }
    }

    // ===== FILE PROCESSING (18.7 & 3) =====
    if (req.file) {
      let fileBuffer = req.file.buffer;
      const isHeic =
        req.file.mimetype === "image/heic" ||
        req.file.mimetype === "image/heif";

      if (isHeic) {
        try {
          const converted = await heicConvert({
            buffer: fileBuffer,
            format: "JPEG",
            quality: 0.9,
          });
          fileBuffer = Buffer.from(converted);
        } catch (err) {
          console.error("HEIC conversion error:", err);
          return fail("Could not process HEIC image, please try again");
        }
      }

      try {
        // 18.7 Corrupt/tiny image check
        const meta = await sharp(fileBuffer).metadata();
        if (!meta.width || meta.width < 100)
          throw new Error("Image too small or corrupt");

        // Section 3: WebP Compression & Thumbnails
        const ext = "webp";
        imagePath = `${userId}/${Date.now()}.${ext}`;
        thumbPath = `${userId}/${Date.now()}_thumb.jpeg`;

        // Main display image: Max 2048px wide
        const mainBuffer = await sharp(fileBuffer)
          .rotate() // Auto-rotate using EXIF orientation
          .resize({ width: 2048, withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();

        // Thumbnail image: Max 400px wide
        const thumbBuffer = await sharp(fileBuffer)
          .rotate()
          .resize({ width: 400, withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();

        // Upload both concurrently
        await Promise.all([
          r2.send(
            new PutObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME,
              Key: imagePath,
              Body: mainBuffer,
              ContentType: "image/webp",
            }),
          ),
          r2.send(
            new PutObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME,
              Key: thumbPath,
              Body: thumbBuffer,
              ContentType: "image/jpeg",
            }),
          ),
        ]);
      } catch (err) {
        console.error("Image processing/upload error:", err);
        return fail(
          "The photo appears to be corrupt or could not be uploaded — please try again.",
        );
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
      image_thumb_path: thumbPath,
      ...exifData,
    });

    if (spotError) {
      if (imagePath) await deleteStorageImage(imagePath);
      if (thumbPath) await deleteStorageImage(thumbPath);
      return fail("Failed to save spot, please try again", 500);
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

      // FIX: Clean up the R2 images so they don't sit orphaned forever
      if (imagePath) await deleteStorageImage(imagePath).catch(() => {});
      if (thumbPath) await deleteStorageImage(thumbPath).catch(() => {});

      return fail("Failed to link units, please try again", 500);
    }

    // Cache nonce to prevent double execution
    if (submission_nonce) {
      recentNonces.add(submission_nonce);
      setTimeout(() => recentNonces.delete(submission_nonce), 30000);
    }

    if (isAjax) {
      return res.json({ success: true, spotId: spot.spot_id });
    }
    res.redirect(`/spots/${spot.spot_id}`);
  } catch (err) {
    // 18.8 Orphaned R2 image cleanup
    if (imagePath) await deleteStorageImage(imagePath).catch(() => {});
    if (thumbPath) await deleteStorageImage(thumbPath).catch(() => {});

    console.error("createSpot error:", err);
    return fail("Something went wrong, please try again", 500);
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
    const number = sanitize(numbers[i]?.trim());
    if (!number) continue;
    units.push({
      unit_number: number,
      unit_class: sanitize(classes[i]?.trim()) || null,
      unit_operator: sanitize(operators[i]?.trim()) || null,
    });
  }

  return units;
};

const formatShutterSpeed = (exposureTime) => {
  if (exposureTime >= 1) return `${exposureTime}s`;
  return `1/${Math.round(1 / exposureTime)}`;
};
