import dns from "node:dns";
import nodemailer from "nodemailer";

// Railway often can't reach Gmail SMTP over IPv6 (ENETUNREACH).
dns.setDefaultResultOrder("ipv4first");

const OTP_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;

function smtpConfigured() {
  return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

function resendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

async function sendViaResend(to: string, subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY!.trim();
  const from =
    process.env.RESEND_FROM?.trim() || "CompApp <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail}`);
  }
}

async function sendViaSmtp(to: string, subject: string, text: string) {
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.replace(/\s/g, "");
  const port = Number(process.env.SMTP_PORT) || 465;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port,
    secure: port === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    auth: { user, pass },
  });

  const from = process.env.SMTP_FROM?.trim() || user;

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

  if (resendConfigured()) {
    try {
      await sendViaResend(to, subject, text);
      return;
    } catch (err) {
      console.error(`[Resend] Failed to send OTP to ${to}:`, err);
    }
  }

  if (smtpConfigured()) {
    try {
      await sendViaSmtp(to, subject, text);
      return;
    } catch (err) {
      console.error(`[SMTP] Failed to send OTP to ${to}:`, err);
    }
  }

  // OTP is already saved — don't block the user. Railway logs show the code.
  console.log(
    `[OTP ${purpose}] ${to}: ${code} (email not sent — add RESEND_API_KEY on Railway or check logs)`
  );
}
