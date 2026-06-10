import cors from "cors";
import express from "express";
import { analyticsRouter } from "./routes/analytics.js";
import { authRouter } from "./routes/auth.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { healthRouter } from "./routes/health.js";
import { invitationsRouter } from "./routes/invitations.js";
import { invitePublicRouter } from "./routes/invite-public.js";
import { registerRouter } from "./routes/register.js";
import { sectionsRouter } from "./routes/sections.js";
import { teamRouter } from "./routes/team.js";
import { whatsappRouter } from "./routes/whatsapp.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
      credentials: true,
    })
  );
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/invitations", invitationsRouter);
  app.use("/api/team", teamRouter);
  app.use("/api/sections", sectionsRouter);
  app.use("/api/register", registerRouter);
  app.use("/api/invite", invitePublicRouter);
  app.use("/api/whatsapp", whatsappRouter);

  return app;
}
