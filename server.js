import "dotenv/config.js"; // MUST be the absolute first line to load .env before other imports evaluate

import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";

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
  deleteSpotController,
  upload,
} from "./src/controllers/spotController.js";

import { serveProfile } from "./src/controllers/profileController.js";
import {
  serveSettings,
  updateProfile,
} from "./src/controllers/settingsController.js";
import { showUnit } from "./src/controllers/unitController.js";
import { serveMap, getMapData } from "./src/controllers/mapController.js";
import { requireAuth, requireOnboarding } from "./src/middleware/auth.js";

// ===== 18.1 ENVIRONMENT VARIABLE VALIDATION =====
// Now this runs safely because dotenv has loaded the variables
const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "BASE_URL",
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(
    `Missing required environment variables: ${missingEnv.join(", ")}`,
  );
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set("trust proxy", 1);

// ===== SECURITY HEADERS (18.5) =====
// Strip any trailing slash so the CSP source is a clean origin
const R2_ORIGIN = process.env.R2_PUBLIC_URL.replace(/\/+$/, "");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'unsafe-inline' needed for the inline <script> blocks in views
        // and inline event handlers (e.g. onclick="history.back()").
        scriptSrc: ["'self'", "'unsafe-inline'", "unpkg.com"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "fonts.googleapis.com",
          "unpkg.com",
        ],
        fontSrc: ["'self'", "fonts.gstatic.com"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          R2_ORIGIN,
          "*.openfreemap.org",
          "*.arcgisonline.com",
          "upload.wikimedia.org",
          "en.wikipedia.org",
        ],
        // MapLibre fetches tiles/glyphs/sprites via fetch(), so tile hosts
        // must be allowed in connect-src, not just img-src.
        connectSrc: [
          "'self'",
          "*.supabase.co",
          "*.openfreemap.org",
          "*.arcgisonline.com",
          "en.wikipedia.org",
        ],
        // MapLibre spins up web workers from blob: URLs
        workerSrc: ["'self'", "blob:"],
      },
    },
  }),
);

// ===== REQUEST LOGGING (18.10) =====
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ===== CONFIG =====
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src/views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// ===== RATE LIMITING (Bug 17.1 & 18.6 Fix) =====
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const page = req.path.includes("login")
      ? "auth/login"
      : req.path.includes("register")
        ? "auth/register"
        : "auth/forgot-password";
    res.status(429).render(page, {
      error: "Too many attempts — please wait 15 minutes before trying again.",
      success: undefined,
      fields: req.body || {},
      sent: false,
    });
  },
});

const spotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  handler: (req, res) =>
    res.status(429).json({ error: "Slow down — max 30 spots per 15 minutes." }),
});

const mapLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  handler: (req, res) => res.status(429).json({ error: "Too many requests." }),
});

// ===== ROOT =====
app.get("/", (req, res) => {
  const hasSession = !!(
    req.cookies?.access_token || req.cookies?.refresh_token
  );
  res.redirect(hasSession ? "/map" : "/login");
});

// ===== HEALTH (18.9) =====
app.get("/health", (req, res) =>
  res.json({ status: "ok", uptime: process.uptime() }),
);

// ===== AUTH =====
app.get("/login", serveLogin);
app.get("/register", serveRegister);
app.post("/login", authLimiter, loginUser);
app.post("/register", authLimiter, registerUser);
app.get("/auth/google", googleAuth);
app.get("/auth/callback", authCallback);
app.post("/auth/session", setSession);
app.get("/signout", signOut);
app.get("/forgot-password", serveForgotPassword);
app.post("/forgot-password", authLimiter, submitForgotPassword);
app.get("/auth/reset-password", serveResetPassword);
app.post("/auth/reset-password", submitResetPassword);

// ===== ONBOARDING =====
app.get("/onboarding", requireAuth, serveOnboarding);
app.post("/onboarding", requireAuth, submitOnboarding);

// ===== PROFILE =====
app.get("/profile", requireAuth, requireOnboarding, serveProfile);

// ===== SESSION CHECK (Gap 7 Fix) =====
app.get("/api/session-check", requireAuth, (req, res) =>
  res.json({ ok: true }),
);

// ===== MAP =====
app.get("/map", serveMap);
app.get("/api/map", mapLimiter, getMapData);

// ===== SETTINGS =====
app.get("/settings", requireAuth, requireOnboarding, serveSettings);
app.post("/settings/profile", requireAuth, requireOnboarding, updateProfile);

// ===== SPOTS =====
app.get("/spots/new", requireAuth, requireOnboarding, serveNewSpot);
app.post(
  "/spots",
  requireAuth,
  requireOnboarding,
  spotLimiter,
  upload.single("photo"),
  createSpotController,
);
app.get("/spots/:spotId", requireAuth, requireOnboarding, showSpot);
app.delete(
  "/spots/:spotId",
  requireAuth,
  requireOnboarding,
  deleteSpotController,
);

// ===== UNITS =====
app.get("/units/:unitId", requireAuth, requireOnboarding, showUnit);

// ===== PUBLIC =====
app.get("/s/:token", showSharedSpot);

// ===== LEGACY REDIRECT =====
app.get("/dashboard", (req, res) => res.redirect("/profile"));

// ===== 404 HANDLER (15) =====
// Must come after every route and the static middleware
app.use((req, res) => {
  res.status(404).render("404");
});

// ===== ERROR HANDLER (15) =====
// Express 5 catches async errors automatically and routes them here
app.use((err, req, res, next) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      route: `${req.method} ${req.path}`,
      userId: req.user?.id ?? null,
      error: err?.message ?? String(err),
      stack: err?.stack ?? null,
    }),
  );
  res.status(500).render("error");
});

// ===== GRACEFUL SHUTDOWN (18.9) =====
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () =>
  console.log(`Spotter running on http://localhost:${PORT}`),
);

process.on("SIGTERM", () => {
  console.log("SIGTERM received — closing server gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
  // Force exit after 10s if connections don't drain
  setTimeout(() => process.exit(1), 10000);
});