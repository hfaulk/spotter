import express from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  requireAdmin,
  serveAdmin,
  toggleSpotActive,
} from "../controllers/adminController.js";

const router = express.Router();

// Both middlewares run on every admin route:
// requireAuth ensures there's a valid session,
// requireAdmin ensures the session belongs to you specifically.
const protect = [requireAuth, requireAdmin];

router.get("/admin", protect, serveAdmin);
router.post("/admin/spots/:spotId/toggle-active", protect, toggleSpotActive);

export default router;
