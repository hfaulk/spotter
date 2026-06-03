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

import { requireAuth, requireOnboarding } from "./src/middleware/auth.js";
import { getSpotsByUser } from "./src/models/spotModel.js";
import { getUnitsBySpot } from "./src/models/unitModel.js";
import supabase from "./src/config/supabase.js";

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

// ===== AUTH ROUTES =====
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

// ===== DASHBOARD =====
app.get("/dashboard", requireAuth, requireOnboarding, async (req, res) => {
  const { data: spots } = await getSpotsByUser(req.user.id);

  const spotsWithData = await Promise.all(
    (spots || []).map(async (spot) => {
      const { data: unitData } = await getUnitsBySpot(spot.spot_id);
      const units = unitData?.map((row) => row.unit) || [];

      let imageUrl = null;
      if (spot.image_path) {
        const { data } = supabase.storage
          .from("spot-images")
          .getPublicUrl(spot.image_path);
        imageUrl = data.publicUrl;
      }

      return { ...spot, units, imageUrl };
    }),
  );

  res.render("dashboard", { user: req.user, spots: spotsWithData });
});

// ===== SPOT ROUTES =====
app.get("/spots/new", requireAuth, requireOnboarding, serveNewSpot);
app.post(
  "/spots",
  requireAuth,
  requireOnboarding,
  upload.single("photo"),
  createSpotController,
);
app.get("/spots/:spotId", requireAuth, requireOnboarding, showSpot);

// ===== PUBLIC ROUTES =====
app.get("/s/:token", showSharedSpot);

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Spotter running on http://localhost:${PORT}`),
);
