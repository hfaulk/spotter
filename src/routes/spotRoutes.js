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

// Spots
router.get("/spots/new", protect, serveNewSpot);
router.post(
  "/spots",
  protect,
  spotLimiter,
  upload.single("photo"),
  createSpotController,
);
router.get("/spots/:spotId", protect, showSpot);
router.delete("/spots/:spotId", protect, deleteSpotController);

// Units
router.get("/units/:unitId", protect, showUnit);

export default router;
