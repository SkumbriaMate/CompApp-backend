import { randomBytes } from "node:crypto";
import {
  generateOtpCode,
  hashOtpCode,
  otpExpiresAt,
  verifyOtpCode,
} from "../lib/otp.js";
import { sendOtpEmail } from "../lib/email.js";
import { slugifyCompanyName, uniqueSlugSuffix } from "../lib/slug.js";
import { supabaseAdmin } from "../lib/supabase.js";

const OTP_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES) || 10;
const DRAFT_HOURS = Number(process.env.DRAFT_EXPIRY_HOURS) || 24;
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7;

type CompanyInput = {
  name: string;
  location: string;
  phone: string;
  email: string;
};

type TeamMemberInput = {
  email: string;
  role: "manager" | "employee" | "accountant";
};

export type RegisterStartPayload = {
  company: CompanyInput;
  sections: string[];
  teamMembers: TeamMemberInput[];
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function draftExpiresAt() {
  return new Date(Date.now() + DRAFT_HOURS * 60 * 60 * 1000);
}

function sessionExpiresAt() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

async function ensureUniqueSlug(baseName: string): Promise<string> {
  let slug = slugifyCompanyName(baseName);

  for (let i = 0; i < 5; i++) {
    const { data } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) return slug;
    slug = `${slugifyCompanyName(baseName)}-${uniqueSlugSuffix()}`;
  }

  return `${slugifyCompanyName(baseName)}-${uniqueSlugSuffix()}`;
}

export async function startRegistration(payload: RegisterStartPayload) {
  const email = normalizeEmail(payload.company.email);
  const sections = payload.sections.map((s) => s.trim()).filter(Boolean);
  const teamMembers = payload.teamMembers
    .map((m) => ({ ...m, email: normalizeEmail(m.email) }))
    .filter((m) => m.email);

  if (!payload.company.name.trim()) {
    throw new Error("Company name is required");
  }
  if (!payload.company.location.trim()) {
    throw new Error("Location is required");
  }
  if (!payload.company.phone.trim()) {
    throw new Error("Phone is required");
  }
  if (!email) {
    throw new Error("Email is required");
  }
  if (sections.length === 0) {
    throw new Error("At least one expense section is required");
  }

  const { data: existingCompany } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingCompany) {
    throw new Error("A company with this email is already registered");
  }

  const expiresAt = draftExpiresAt();

  const { data: draft, error: draftError } = await supabaseAdmin
    .from("registration_drafts")
    .insert({
      email,
      company_name: payload.company.name.trim(),
      location: payload.company.location.trim(),
      phone: payload.company.phone.trim(),
      sections,
      team_members: teamMembers,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, email, expires_at")
    .single();

  if (draftError || !draft) {
    throw new Error(draftError?.message ?? "Failed to save registration draft");
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const otpExpires = otpExpiresAt(OTP_MINUTES);

  const { error: otpError } = await supabaseAdmin.from("otp_codes").insert({
    email,
    code_hash: codeHash,
    purpose: "register",
    registration_draft_id: draft.id,
    expires_at: otpExpires.toISOString(),
  });

  if (otpError) {
    throw new Error(otpError.message);
  }

  await sendOtpEmail(email, code, "register");

  return {
    draftId: draft.id,
    email: draft.email,
    expiresAt: otpExpires.toISOString(),
  };
}

export async function verifyRegistration(
  draftId: string,
  email: string,
  code: string
) {
  const normalizedEmail = normalizeEmail(email);

  const { data: draft, error: draftError } = await supabaseAdmin
    .from("registration_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("email", normalizedEmail)
    .is("completed_at", null)
    .maybeSingle();

  if (draftError || !draft) {
    throw new Error("Registration not found or already completed");
  }

  if (new Date(draft.expires_at) < new Date()) {
    throw new Error("Registration expired. Please start again.");
  }

  const { data: otpRow, error: otpFetchError } = await supabaseAdmin
    .from("otp_codes")
    .select("*")
    .eq("registration_draft_id", draftId)
    .eq("email", normalizedEmail)
    .eq("purpose", "register")
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpFetchError || !otpRow) {
    throw new Error("Verification code not found");
  }

  if (new Date(otpRow.expires_at) < new Date()) {
    throw new Error("Verification code expired");
  }

  if (otpRow.attempts >= otpRow.max_attempts) {
    throw new Error("Too many attempts. Request a new code.");
  }

  if (!verifyOtpCode(code, otpRow.code_hash)) {
    await supabaseAdmin
      .from("otp_codes")
      .update({ attempts: otpRow.attempts + 1 })
      .eq("id", otpRow.id);
    throw new Error("Invalid verification code");
  }

  const slug = await ensureUniqueSlug(draft.company_name);
  const sections = (draft.sections as string[]) ?? [];
  const teamMembers = (draft.team_members as TeamMemberInput[]) ?? [];

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .insert({
      name: draft.company_name,
      slug,
      location: draft.location,
      phone: draft.phone,
      email: normalizedEmail,
    })
    .select("id")
    .single();

  if (companyError || !company) {
    throw new Error(companyError?.message ?? "Failed to create company");
  }

  const sectionRows = sections.map((name, index) => ({
    company_id: company.id,
    name,
    sort_order: index + 1,
  }));

  const { error: sectionsError } = await supabaseAdmin
    .from("expense_sections")
    .insert(sectionRows);

  if (sectionsError) {
    throw new Error(sectionsError.message);
  }

  const { data: authUser, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { full_name: draft.company_name },
    });

  if (authError || !authUser.user) {
    throw new Error(authError?.message ?? "Failed to create owner account");
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: authUser.user.id,
    company_id: company.id,
    email: normalizedEmail,
    full_name: draft.company_name,
    role: "owner",
  });

  if (profileError) {
    throw new Error(profileError.message);
  }

  let invitationsSent = 0;

  if (teamMembers.length > 0) {
    const inviteRows = teamMembers.map((member) => ({
      company_id: company.id,
      email: member.email,
      role: member.role,
      invited_by: authUser.user!.id,
      registration_draft_id: draftId,
      token: randomBytes(32).toString("hex"),
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      sent_at: new Date().toISOString(),
    }));

    const { error: inviteError } = await supabaseAdmin
      .from("invitations")
      .insert(inviteRows);

    if (inviteError) {
      throw new Error(inviteError.message);
    }

    invitationsSent = inviteRows.length;

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[INVITES] Queued ${invitationsSent} invitation(s) for company ${company.id}`
      );
    }
  }

  const deviceToken = randomBytes(32).toString("hex");
  const sessionExpires = sessionExpiresAt();

  const { error: sessionError } = await supabaseAdmin
    .from("device_sessions")
    .insert({
      profile_id: authUser.user.id,
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

  await supabaseAdmin
    .from("registration_drafts")
    .update({
      completed_at: new Date().toISOString(),
      company_id: company.id,
    })
    .eq("id", draftId);

  return {
    companyId: company.id,
    deviceToken,
    expiresAt: sessionExpires.toISOString(),
    invitationsSent,
  };
}
