import express from "express";
import { authLimiter } from "../middleware/rateLimiters.js";
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
} from "../controllers/authController.js";

const router = express.Router();

router.get("/login", serveLogin);
router.post("/login", authLimiter, loginUser);
router.get("/register", serveRegister);
router.post("/register", authLimiter, registerUser);
router.get("/auth/google", googleAuth);
router.get("/auth/callback", authCallback);
router.post("/auth/session", setSession);
router.get("/signout", signOut);
router.get("/forgot-password", serveForgotPassword);
router.post("/forgot-password", authLimiter, submitForgotPassword);
router.get("/auth/reset-password", serveResetPassword);
router.post("/auth/reset-password", submitResetPassword);

export default router;
