import dns from "node:dns/promises";
import nodemailer from "nodemailer";

const OTP_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;

function gmailApiConfigured() {
  return Boolean(
    process.env.GMAIL_CLIENT_ID?.trim() &&
      process.env.GMAIL_CLIENT_SECRET?.trim() &&
      process.env.GMAIL_REFRESH_TOKEN?.trim()
  );
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

function senderEmail() {
  return (
    process.env.GMAIL_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    ""
  );
}

function encodeGmailRaw(from: string, to: string, subject: string, text: string) {
  const message = [
    `From: CompApp <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
  ].join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getGmailAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!.trim(),
      client_secret: process.env.GMAIL_CLIENT_SECRET!.trim(),
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!.trim(),
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Gmail token error: ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Gmail token response missing access_token");
  }
  return data.access_token;
}

/** Gmail over HTTPS (port 443) — works on Railway Hobby where SMTP is blocked. */
async function sendViaGmailApi(
  to: string,
  subject: string,
  text: string
) {
  const from = senderEmail();
  if (!from) {
    throw new Error("Set GMAIL_FROM or SMTP_USER to your Gmail address");
  }

  const accessToken = await getGmailAccessToken();
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodeGmailRaw(from, to, subject, text) }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gmail API error: ${await res.text()}`);
  }
}

async function resolveSmtpIpv4(hostname: string) {
  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    return { host: address, servername: hostname };
  } catch {
    return { host: hostname, servername: hostname };
  }
}

/** Gmail SMTP — works locally and on Railway Pro. Blocked on Railway Hobby. */
async function sendViaSmtp(to: string, subject: string, text: string) {
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.replace(/\s/g, "");
  const port = Number(process.env.SMTP_PORT) || 465;
  const from = process.env.SMTP_FROM?.trim() || user;
  const hostname = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const { host, servername } = await resolveSmtpIpv4(hostname);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    tls: { servername },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `CompApp <${from}>`,
    to,
    subject,
    text,
  });
}

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: "login" | "register"
) {
  const subject =
    purpose === "login"
      ? "Your CompApp login code"
      : "Verify your CompApp registration";
  const text = `Your verification code is: ${code}\n\nIt expires in ${OTP_MINUTES} minutes.\n\nIf you did not request this, you can ignore this email.`;

  if (gmailApiConfigured()) {
    try {
      await sendViaGmailApi(to, subject, text);
      return;
    } catch (err) {
      console.error(`[Gmail API] Failed to send OTP to ${to}:`, err);
    }
  }

  if (smtpConfigured()) {
    try {
      await sendViaSmtp(to, subject, text);
      return;
    } catch (err) {
      console.error(`[SMTP] Failed to send OTP to ${to}:`, err);
      console.error(
        "[SMTP] Railway Hobby blocks ports 465/587 — use Gmail API vars or upgrade to Railway Pro"
      );
    }
  }

  console.log(`[OTP ${purpose}] ${to}: ${code} (email not sent — check logs)`);
}
