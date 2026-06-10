import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { requireManagerOrOwner } from "../middleware/roles.js";
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from "../services/invitations.service.js";

export const invitationsRouter = Router();

invitationsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const companyId = req.session!.profile.company_id;
    const invitations = await listInvitations(companyId);
    res.json({ invitations });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load invitations";
    res.status(500).json({ error: message });
  }
});

invitationsRouter.post(
  "/",
  requireAuth,
  requireManagerOrOwner,
  async (req: AuthedRequest, res) => {
    try {
      const { email, role } = req.body ?? {};
      const companyId = req.session!.profile.company_id;
      const invitedBy = req.session!.profile.id;

      if (!email || typeof email !== "string") {
        res.status(400).json({ error: "Email is required" });
        return;
      }

      const validRoles = ["manager", "employee", "accountant"];
      const inviteRole =
        typeof role === "string" && validRoles.includes(role)
          ? (role as "manager" | "employee" | "accountant")
          : "employee";

      const invitation = await createInvitation(
        companyId,
        invitedBy,
        email,
        inviteRole
      );
      res.json(invitation);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send invitation";
      res.status(400).json({ error: message });
    }
  }
);

invitationsRouter.delete(
  "/:id",
  requireAuth,
  requireManagerOrOwner,
  async (req: AuthedRequest, res) => {
    try {
      const companyId = req.session!.profile.company_id;
      const id = String(req.params.id);
      const result = await revokeInvitation(companyId, id);
      res.json(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove invitation";
      res.status(400).json({ error: message });
    }
  }
);
