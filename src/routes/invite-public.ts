import { Router } from "express";
import {
  acceptInvitation,
  getInvitationByToken,
} from "../services/invite-accept.service.js";

export const invitePublicRouter = Router();

invitePublicRouter.get("/:token", async (req, res) => {
  try {
    const invite = await getInvitationByToken(req.params.token);
    res.json(invite);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid invitation";
    res.status(400).json({ error: message });
  }
});

invitePublicRouter.post("/:token/accept", async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body ?? {};
    const result = await acceptInvitation(
      req.params.token,
      firstName ?? "",
      lastName ?? "",
      phone ?? ""
    );
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Accept failed";
    res.status(400).json({ error: message });
  }
});
