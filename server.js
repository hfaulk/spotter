import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import {
  serveLogin,
  serveRegister,
  registerUser,
  loginUser,
  googleAuth,
  authCallback,
  setSession,
  signOut,
  serveForgotPassword,
  submitForgotPassword,
  serveResetPassword,
  submitResetPassword,
} from "./src/controllers/authController.js";

import {
  serveOnboarding,
  submitOnboarding,
} from "./src/controllers/onboardingController.js";

import {
  serveNewSpot,
  createSpotController,
  showSpot,
  showSharedSpot,
  upload,
} from "./src/controllers/spotController.js";

import { showUnit } from "./src/controllers/unitController.js";

import { serveProfile } from "./src/controllers/profileController.js";
import {
  serveSettings,
  updateProfile,
} from "./src/controllers/settingsController.js";
import { requireAuth, requireOnboarding } from "./src/middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ===== CONFIG =====
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src/views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// ===== ROOT =====
app.get("/", (req, res) => res.redirect("/login"));

// ===== AUTH =====
app.get("/login", serveLogin);
app.get("/register", serveRegister);
app.post("/login", loginUser);
app.post("/register", registerUser);
app.get("/auth/google", googleAuth);
app.get("/auth/callback", authCallback);
app.post("/auth/session", setSession);
app.get("/signout", signOut);
app.get("/forgot-password", serveForgotPassword);
app.post("/forgot-password", submitForgotPassword);
app.get("/auth/reset-password", serveResetPassword);
app.post("/auth/reset-password", submitResetPassword);

// ===== ONBOARDING =====
app.get("/onboarding", requireAuth, serveOnboarding);
app.post("/onboarding", requireAuth, submitOnboarding);

// ===== PROFILE =====
app.get("/profile", requireAuth, requireOnboarding, serveProfile);

// ===== MAP =====
app.get("/map", requireAuth, requireOnboarding, (req, res) => {
  res.render("map", { activePage: "map" });
});

// ===== SETTINGS =====
app.get("/settings", requireAuth, requireOnboarding, serveSettings);
app.post("/settings/profile", requireAuth, requireOnboarding, updateProfile);

// ===== SPOTS =====
app.get("/spots/new", requireAuth, requireOnboarding, serveNewSpot);
app.post(
  "/spots",
  requireAuth,
  requireOnboarding,
  upload.single("photo"),
  createSpotController,
);
app.get("/spots/:spotId", requireAuth, requireOnboarding, showSpot);

// ===== UNITS =====
app.get("/units/:unitId", requireAuth, requireOnboarding, showUnit);

// ===== PUBLIC =====
app.get("/s/:token", showSharedSpot);

// ===== REDIRECT LEGACY DASHBOARD =====
app.get("/dashboard", (req, res) => res.redirect("/profile"));

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Spotter running on http://localhost:${PORT}`),
);
