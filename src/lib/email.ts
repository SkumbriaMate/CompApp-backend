import dns from "node:dns/promises";
import nodemailer from "nodemailer";

const OTP_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;

function smtpConfigured() {
  return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

/** Railway can't reach Gmail over IPv6 — resolve hostname to an IPv4 address. */
async function resolveSmtpIpv4(hostname: string) {
  try {
    const { address } = await dns.lookup(hostname, { family: 4 });
    return { host: address, servername: hostname };
  } catch {
    return { host: hostname, servername: hostname };
  }
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
