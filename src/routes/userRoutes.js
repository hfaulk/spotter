import express from "express";
import { requireAuth, requireOnboarding } from "../middleware/auth.js";
import { serveProfile } from "../controllers/profileController.js";
import {
  serveOnboarding,
  submitOnboarding,
} from "../controllers/onboardingController.js";
import {
  serveSettings,
  updateProfile,
} from "../controllers/settingsController.js";

const router = express.Router();

router.get("/onboarding", requireAuth, serveOnboarding);
router.post("/onboarding", requireAuth, submitOnboarding);
router.get("/profile", requireAuth, requireOnboarding, serveProfile);
router.get("/settings", requireAuth, requireOnboarding, serveSettings);
router.post("/settings/profile", requireAuth, requireOnboarding, updateProfile);

export default router;
