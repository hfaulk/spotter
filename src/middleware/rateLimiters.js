import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
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

export const spotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  handler: (req, res) =>
    res.status(429).json({ error: "Slow down — max 30 spots per 15 minutes." }),
});

export const mapLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  handler: (req, res) => res.status(429).json({ error: "Too many requests." }),
});
