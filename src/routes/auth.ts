import { Router } from "express";
import {
  getSessionFromToken,
  sendLoginOtp,
  verifyLoginOtp,
} from "../services/auth.service.js";

export const authRouter = Router();

authRouter.post("/otp/send", async (req, res) => {
  try {
    const { email } = req.body ?? {};

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const result = await sendLoginOtp(email);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send code";
    res.status(400).json({ error: message });
  }
});

authRouter.post("/otp/verify", async (req, res) => {
  try {
    const { email, code } = req.body ?? {};

    if (!email || !code) {
      res.status(400).json({ error: "Email and code are required" });
      return;
    }

    const result = await verifyLoginOtp(email, code);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    res.status(400).json({ error: message });
  }
});

authRouter.get("/me", async (req, res) => {
  try {
    const header = req.headers.authorization;
    const token =
      header?.startsWith("Bearer ") ? header.slice(7) : req.query.token;

    if (!token || typeof token !== "string") {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const session = await getSessionFromToken(token);

    if (!session) {
      res.status(401).json({ error: "Session expired or invalid" });
      return;
    }

    res.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auth check failed";
    res.status(500).json({ error: message });
  }
});
