import { Router } from "express";
import { isWhatsAppConfigured } from "../lib/whatsapp-client.js";
import { handleWhatsAppWebhook } from "../services/whatsapp-bot.service.js";

export const whatsappRouter = Router();

whatsappRouter.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const tokenRaw = req.query["hub.verify_token"];
  const challengeRaw = req.query["hub.challenge"];
  const token = typeof tokenRaw === "string" ? tokenRaw.trim() : "";
  const challenge =
    typeof challengeRaw === "string"
      ? challengeRaw
      : Array.isArray(challengeRaw)
        ? challengeRaw[0]
        : "";
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";

  if (mode === "subscribe" && token && verifyToken && token === verifyToken && challenge) {
    console.log("[WhatsApp] Webhook verified");
    res.status(200).send(challenge);
    return;
  }

  if (mode === "subscribe") {
    console.warn("[WhatsApp] Webhook verify failed", {
      hasVerifyToken: Boolean(verifyToken),
      tokenMatch: token === verifyToken,
      hasChallenge: Boolean(challenge),
    });
  }

  res.sendStatus(403);
});

whatsappRouter.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    await handleWhatsAppWebhook(req.body);
  } catch (err) {
    console.error("[WhatsApp webhook error]", err);
  }
});

whatsappRouter.get("/status", (_req, res) => {
  res.json({
    configured: isWhatsAppConfigured(),
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? "set" : "missing",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ? "set" : "missing",
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? "set" : "missing",
    webhookUrl: "POST /api/whatsapp/webhook",
  });
});
