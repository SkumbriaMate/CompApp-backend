import type { NextFunction, Request, Response } from "express";
import { getSessionFromToken } from "../services/auth.service.js";

export type SessionData = NonNullable<
  Awaited<ReturnType<typeof getSessionFromToken>>
>;

export type AuthedRequest = Request & {
  session?: SessionData;
};

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const session = await getSessionFromToken(token);

  if (!session) {
    res.status(401).json({ error: "Session expired or invalid" });
    return;
  }

  req.session = session;
  next();
}
