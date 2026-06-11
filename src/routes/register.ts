import { Router } from "express";
import { completeRegistrationWithGoogle } from "../services/google-auth.service.js";

export const registerRouter = Router();

registerRouter.post("/complete", async (req, res) => {
  try {
    const { credential, company, sections, teamMembers } = req.body ?? {};

    if (!credential || typeof credential !== "string") {
      res.status(400).json({ error: "Google credential is required" });
      return;
    }

    const result = await completeRegistrationWithGoogle(credential, {
      company: company ?? {},
      sections: Array.isArray(sections) ? sections : [],
      teamMembers: Array.isArray(teamMembers) ? teamMembers : [],
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    res.status(400).json({ error: message });
  }
});
