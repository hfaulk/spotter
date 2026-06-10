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

// Apply auth middleware to all routes in this file
router.use(requireAuth, requireOnboarding);

// Spots
router.get("/spots/new", serveNewSpot);
router.post(
  "/spots",
  spotLimiter,
  upload.single("photo"),
  createSpotController,
);
router.get("/spots/:spotId", showSpot);
router.delete("/spots/:spotId", deleteSpotController);

// Units
router.get("/units/:unitId", showUnit);

export default router;
