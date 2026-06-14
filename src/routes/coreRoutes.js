import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { mapLimiter } from "../middleware/rateLimiters.js";
import { serveMap, getMapData } from "../controllers/mapController.js";
import { showSharedSpot } from "../controllers/spotController.js";
import { getWikiSummary } from "../controllers/unitController.js";
import { submitReport } from "../controllers/reportController.js";

const router = express.Router();

// Root & Redirects
router.get("/", (req, res) => {
  const hasSession = !!(
    req.cookies?.access_token || req.cookies?.refresh_token
  );
  res.redirect(hasSession ? "/map" : "/login");
});
router.get("/dashboard", (req, res) => res.redirect("/profile"));

// Map
router.get("/map", serveMap);
router.get("/api/map", mapLimiter, getMapData);

// Wiki Proxy (Protected so only valid app users can trigger Wikipedia requests)
router.get("/api/wiki/:classNum", requireAuth, getWikiSummary);

// Public Shared Spots
router.get("/s/:token", showSharedSpot);

// Privacy Policy (public)
router.get("/privacy", (req, res) =>
  res.render("privacy", { activePage: "privacy" }),
);

// APIs & Health
router.post("/api/report", requireAuth, submitReport);
router.get("/api/session-check", requireAuth, (req, res) =>
  res.json({ ok: true }),
);
router.get("/health", (req, res) =>
  res.json({ status: "ok", uptime: process.uptime() }),
);

export default router;
