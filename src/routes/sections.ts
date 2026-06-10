import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { createSection, listSections } from "../services/sections.service.js";

export const sectionsRouter = Router();

sectionsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const companyId = req.session!.profile.company_id;
    const sections = await listSections(companyId);
    res.json({ sections });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load sections";
    res.status(500).json({ error: message });
  }
});

sectionsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { name } = req.body ?? {};
    const companyId = req.session!.profile.company_id;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Section name is required" });
      return;
    }

    const section = await createSection(companyId, name);
    res.json(section);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create section";
    res.status(400).json({ error: message });
  }
});
