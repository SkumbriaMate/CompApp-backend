import { randomBytes } from "node:crypto";
import {
  generateOtpCode,
  hashOtpCode,
  otpExpiresAt,
  verifyOtpCode,
} from "../lib/otp.js";
import { supabaseAdmin } from "../lib/supabase.js";
import {
  ensureCompanyOwnerRole,
  findActiveProfileByEmail,
  isManagerOrOwner,
  normalizeEmail,
} from "./profile-role.service.js";

const OTP_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7;

function sessionExpiresAt() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

function logOtp(email: string, code: string) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[OTP login] ${email}: ${code}`);
  }
}

export async function sendLoginOtp(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error("Email is required");
  }

  const profile = await findActiveProfileByEmail(normalizedEmail);

  if (!profile) {
    throw new Error("No account found for this email");
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const otpExpires = otpExpiresAt(OTP_MINUTES);

  const { error: otpError } = await supabaseAdmin.from("otp_codes").insert({
    email: normalizedEmail,
    code_hash: codeHash,
    purpose: "login",
    expires_at: otpExpires.toISOString(),
  });

  if (otpError) {
    throw new Error(otpError.message);
  }

  logOtp(normalizedEmail, code);

  return {
    email: normalizedEmail,
    expiresAt: otpExpires.toISOString(),
  };
}

export async function verifyLoginOtp(email: string, code: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !code.trim()) {
    throw new Error("Email and code are required");
  }

  const profile = await findActiveProfileByEmail(normalizedEmail);

  if (!profile) {
    throw new Error("No account found for this email");
  }

  const { data: otpRow, error: otpFetchError } = await supabaseAdmin
    .from("otp_codes")
    .select("*")
    .eq("email", normalizedEmail)
    .eq("purpose", "login")
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpFetchError || !otpRow) {
    throw new Error("Verification code not found. Request a new one.");
  }

  if (new Date(otpRow.expires_at) < new Date()) {
    throw new Error("Verification code expired");
  }

  if (otpRow.attempts >= otpRow.max_attempts) {
    throw new Error("Too many attempts. Request a new code.");
  }

  if (!verifyOtpCode(code.trim(), otpRow.code_hash)) {
    await supabaseAdmin
      .from("otp_codes")
      .update({ attempts: otpRow.attempts + 1 })
      .eq("id", otpRow.id);
    throw new Error("Invalid verification code");
  }

  const deviceToken = randomBytes(32).toString("hex");
  const sessionExpires = sessionExpiresAt();

  const { error: sessionError } = await supabaseAdmin
    .from("device_sessions")
    .insert({
      profile_id: profile.id,
      device_token: deviceToken,
      expires_at: sessionExpires.toISOString(),
    });

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  await supabaseAdmin
    .from("otp_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", otpRow.id);

  return {
    deviceToken,
    companyId: profile.company_id,
    expiresAt: sessionExpires.toISOString(),
  };
}

export async function getSessionFromToken(deviceToken: string) {
  if (!deviceToken.trim()) {
    return null;
  }

  const { data: session, error } = await supabaseAdmin
    .from("device_sessions")
    .select("id, profile_id, expires_at, revoked_at")
    .eq("device_token", deviceToken)
    .maybeSingle();

  if (error || !session || session.revoked_at) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    return null;
  }

  let { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, company_id, email, full_name, role")
    .eq("id", session.profile_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!profile) {
    return null;
  }

  // Fix stale sessions pointing at the wrong profile row for this email
  const canonical = await findActiveProfileByEmail(profile.email);
  if (canonical && canonical.id !== profile.id) {
    await supabaseAdmin
      .from("device_sessions")
      .update({ profile_id: canonical.id })
      .eq("id", session.id);

    const { data: refreshed } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, email, full_name, role")
      .eq("id", canonical.id)
      .eq("is_active", true)
      .maybeSingle();

    if (refreshed) {
      profile = refreshed;
    }
  }

  const role = await ensureCompanyOwnerRole(profile);
  const canManageTeam = isManagerOrOwner(role);

  await supabaseAdmin
    .from("device_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.id);

  return {
    profile: { ...profile, role },
    permissions: {
      canManageTeam,
      role,
    },
    expiresAt: session.expires_at,
  };
}
