import { Router } from "express";
import { isWhatsAppConfigured } from "../lib/whatsapp-client.js";
import { handleWhatsAppWebhook } from "../services/whatsapp-bot.service.js";

export const whatsappRouter = Router();

whatsappRouter.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken && challenge) {
    console.log("[WhatsApp] Webhook verified");
    res.status(200).send(challenge);
    return;
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
