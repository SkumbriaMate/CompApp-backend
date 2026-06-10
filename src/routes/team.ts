import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { requireManagerOrOwner } from "../middleware/roles.js";
import { listTeamMembers, removeTeamMember } from "../services/team.service.js";

export const teamRouter = Router();

teamRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const companyId = req.session!.profile.company_id;
    const members = await listTeamMembers(companyId);
    res.json({ members });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load team";
    res.status(500).json({ error: message });
  }
});

teamRouter.delete(
  "/:profileId",
  requireAuth,
  requireManagerOrOwner,
  async (req: AuthedRequest, res) => {
    try {
      const companyId = req.session!.profile.company_id;
      const actor = req.session!.profile;
      const profileId = String(req.params.profileId);
      const result = await removeTeamMember(
        companyId,
        profileId,
        { id: actor.id, role: actor.role }
      );
      res.json(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove team member";
      res.status(400).json({ error: message });
    }
  }
);
