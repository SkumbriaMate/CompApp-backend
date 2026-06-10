import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getDashboardOverview } from "../services/dashboard.service.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const companyId = req.session!.profile.company_id;
    const result = await getDashboardOverview(companyId);
    res.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load dashboard";
    res.status(500).json({ error: message });
  }
});
