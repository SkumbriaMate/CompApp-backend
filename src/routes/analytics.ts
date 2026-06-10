import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getAnalytics } from "../services/analytics.service.js";

export const analyticsRouter = Router();

analyticsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const companyId = req.session!.profile.company_id;
    const analytics = await getAnalytics(companyId);
    res.json(analytics);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load analytics";
    res.status(500).json({ error: message });
  }
});
