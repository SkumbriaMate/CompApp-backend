import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "./auth.js";
import { isManagerOrOwner } from "../services/profile-role.service.js";

export function requireManagerOrOwner(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const canManage = req.session?.permissions?.canManageTeam;
  const role = req.session?.profile.role;

  if (!canManage && (!role || !isManagerOrOwner(role))) {
    res.status(403).json({ error: "Only owners and managers can do this" });
    return;
  }
  next();
}
