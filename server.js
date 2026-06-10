import "dotenv/config.js"; // MUST be the absolute first line to load .env before other imports evaluate

import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import compression from "compression";
import { fileURLToPath } from "url";

// Import Route Modules
import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import spotRoutes from "./src/routes/spotRoutes.js";
import coreRoutes from "./src/routes/coreRoutes.js";

// ===== ENVIRONMENT VARIABLE VALIDATION =====
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

app.use(compression());

// ===== SECURITY HEADERS =====
const R2_ORIGIN = process.env.R2_PUBLIC_URL.replace(/\/+$/, "");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "unpkg.com"],
        scriptSrcAttr: ["'unsafe-inline'"], // Allowed for inline history.back()
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
        connectSrc: [
          "'self'",
          "*.supabase.co",
          "*.openfreemap.org",
          "*.arcgisonline.com",
          "en.wikipedia.org",
        ],
        workerSrc: ["'self'", "blob:"],
      },
    },
  }),
);

// ===== REQUEST LOGGING =====
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ===== CONFIG =====
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src/views"));
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "30d", // Cache static assets for 30 days
    etag: true, // Helps the browser know if the file changed
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Ignore explicit favicon requests to prevent 404 logs
app.get("/favicon.ico", (req, res) => res.status(204).end());

// ===== MOUNT ROUTES =====
app.use("/", authRoutes);
app.use("/", userRoutes);
app.use("/", spotRoutes);
app.use("/", coreRoutes);

// ===== 404 HANDLER =====
app.use((req, res) => {
  res.status(404).render("404");
});

// ===== ERROR HANDLER =====
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

// ===== GRACEFUL SHUTDOWN =====
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
  setTimeout(() => process.exit(1), 10000);
});
