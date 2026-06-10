import { Router } from "express";
import {
  startRegistration,
  verifyRegistration,
} from "../services/register.service.js";

export const registerRouter = Router();

registerRouter.post("/start", async (req, res) => {
  try {
    const result = await startRegistration(req.body);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    res.status(400).json({ error: message });
  }
});

registerRouter.post("/verify", async (req, res) => {
  try {
    const { draftId, email, code } = req.body ?? {};

    if (!draftId || !email || !code) {
      res.status(400).json({ error: "draftId, email, and code are required" });
      return;
    }

    const result = await verifyRegistration(draftId, email, code);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    res.status(400).json({ error: message });
  }
});
