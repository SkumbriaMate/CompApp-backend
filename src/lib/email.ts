import nodemailer from "nodemailer";

const OTP_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;

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
    console.log(`[OTP ${purpose}] ${to}: ${code} (SMTP not configured — email not sent)`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!.trim(),
    },
  });

  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER!.trim();

  await transporter.sendMail({
    from: `CompApp <${from}>`,
    to,
    subject,
    text,
  });
}
