import "dotenv/config.js"; // This MUST be the first line
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

const isProd = process.env.NODE_ENV === "production";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [nodeProfilingIntegration()],
  // 10% sampling in production — 100% locally so you see every trace while developing
  tracesSampleRate: isProd ? 0.1 : 1.0,
  profilesSampleRate: isProd ? 0.1 : 1.0,
});