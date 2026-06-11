import { Router } from "express";
import {
  completeInviteWithGoogle,
  loginWithGoogle,
} from "../services/google-auth.service.js";
import { getSessionFromToken } from "../services/auth.service.js";

export const authRouter = Router();

authRouter.post("/google", async (req, res) => {
  try {
    const { credential } = req.body ?? {};

    if (!credential || typeof credential !== "string") {
      res.status(400).json({ error: "Google credential is required" });
      return;
    }

    const result = await loginWithGoogle(credential);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google sign-in failed";
    res.status(400).json({ error: message });
  }
});

authRouter.post("/google/accept-invite", async (req, res) => {
  try {
    const { credential, firstName, lastName, phone } = req.body ?? {};

    if (!credential || typeof credential !== "string") {
      res.status(400).json({ error: "Google credential is required" });
      return;
    }

    const result = await completeInviteWithGoogle(
      credential,
      typeof firstName === "string" ? firstName : "",
      typeof lastName === "string" ? lastName : "",
      typeof phone === "string" ? phone : ""
    );
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to join team";
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
