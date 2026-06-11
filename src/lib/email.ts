import dns from "node:dns";
import type { LookupFunction } from "node:net";
import nodemailer from "nodemailer";

const OTP_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;

/** Railway resolves smtp.gmail.com to IPv6 which is unreachable — force IPv4 only. */
const lookupIpv4: LookupFunction = (hostname, options, callback) => {
  if (typeof options === "function") {
    dns.lookup(hostname, { family: 4 }, options);
    return;
  }
  dns.lookup(hostname, { family: 4 }, callback);
};

function smtpConfigured() {
  return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
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

  if (!smtpConfigured()) {
    console.log(`[OTP ${purpose}] ${to}: ${code} (SMTP not configured)`);
    return;
  }

  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.replace(/\s/g, "");
  const port = Number(process.env.SMTP_PORT) || 465;
  const from = process.env.SMTP_FROM?.trim() || user;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port,
    secure: port === 465,
    family: 4,
    lookup: lookupIpv4,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: `CompApp <${from}>`,
      to,
      subject,
      text,
    });
  } catch (err) {
    console.error(`[SMTP] Failed to send OTP to ${to}:`, err);
    console.log(`[OTP ${purpose}] ${to}: ${code} (SMTP failed — use code from logs)`);
  }
}
