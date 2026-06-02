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
} from "./src/controllers/authController.js";

import { requireAuth } from "./src/middleware/auth.js";

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

// ===== ROUTES =====
app.get("/", (req, res) => res.redirect("/login"));

// Auth
app.get("/login", serveLogin);
app.get("/register", serveRegister);
app.post("/login", loginUser);
app.post("/register", registerUser);
app.get("/auth/google", googleAuth);
app.get("/auth/callback", authCallback);
app.post("/auth/session", setSession);
app.get("/signout", signOut);

// Protected
app.get("/dashboard", requireAuth, (req, res) =>
  res.render("dashboard", { user: req.user }),
);

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Spotter running on http://localhost:${PORT}`),
);
