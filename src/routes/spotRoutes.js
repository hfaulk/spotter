import express from "express";
import { requireAuth, requireOnboarding } from "../middleware/auth.js";
import { spotLimiter } from "../middleware/rateLimiters.js";
import {
  serveNewSpot,
  createSpotController,
  showSpot,
  deleteSpotController,
  upload,
} from "../controllers/spotController.js";
import { showUnit } from "../controllers/unitController.js";

const router = express.Router();

// NOTE: middleware is attached per-route, NOT via router.use().
// router.use(requireAuth) runs for EVERY request passing through this
// router — including public routes like /s/:token that live in routers
// mounted after this one — bouncing logged-out visitors to /login.
const protect = [requireAuth, requireOnboarding];

// Multer throws (file too large, wrong type) BEFORE the controller runs,
// which otherwise falls through to the generic 500 page / a useless toast.
// Catch it here and answer in the format the client expects.
const uploadPhoto = (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (!err) return next();

    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "That photo is too large — the limit is 15MB."
        : err.message || "Could not upload that photo — please try again.";

    const isAjax = req.headers["x-requested-with"] === "fetch";
    return isAjax
      ? res.status(400).json({ success: false, error: message })
      : res.status(400).render("spots/new", { error: message });
  });
};

// Spots
router.get("/spots/new", protect, serveNewSpot);
router.post("/spots", protect, spotLimiter, uploadPhoto, createSpotController);
router.get("/spots/:spotId", protect, showSpot);
router.delete("/spots/:spotId", protect, deleteSpotController);

// Units
router.get("/units/:unitId", protect, showUnit);

export default router;
