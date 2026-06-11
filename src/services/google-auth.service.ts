import { randomBytes } from "node:crypto";
import { verifyGoogleIdToken } from "../lib/google-auth.js";
import { normalizePhoneE164 } from "../lib/phone.js";
import { slugifyCompanyName, uniqueSlugSuffix } from "../lib/slug.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { sendSectionPicker, sendText } from "../lib/whatsapp-client.js";
import { findPendingInvitationByEmail } from "./invitations.service.js";
import {
  findActiveProfileByEmail,
  normalizeEmail,
} from "./profile-role.service.js";

const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 7;

type TeamMemberInput = {
  email: string;
  role: "manager" | "employee" | "accountant";
};

export type RegisterCompletePayload = {
  company: {
    name: string;
    location: string;
    phone: string;
  };
  sections: string[];
  teamMembers: TeamMemberInput[];
};

function sessionExpiresAt() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

async function createDeviceSession(profileId: string) {
  const deviceToken = randomBytes(32).toString("hex");
  const sessionExpires = sessionExpiresAt();

  const { error } = await supabaseAdmin.from("device_sessions").insert({
    profile_id: profileId,
    device_token: deviceToken,
    expires_at: sessionExpires.toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    deviceToken,
    expiresAt: sessionExpires.toISOString(),
  };
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

export async function loginWithGoogle(credential: string) {
  const googleUser = await verifyGoogleIdToken(credential);

  if (!googleUser.emailVerified) {
    throw new Error("Your Google email must be verified");
  }

  const email = normalizeEmail(googleUser.email);
  const profile = await findActiveProfileByEmail(email);

  if (profile) {
    const session = await createDeviceSession(profile.id);
    return {
      type: "session" as const,
      deviceToken: session.deviceToken,
      companyId: profile.company_id,
      expiresAt: session.expiresAt,
    };
  }

  const invite = await findPendingInvitationByEmail(email);
  if (invite) {
    return {
      type: "invite" as const,
      email,
      name: googleUser.name,
      givenName: googleUser.givenName,
      familyName: googleUser.familyName,
      companyId: invite.companyId,
      companyName: invite.companyName,
      role: invite.role,
    };
  }

  return {
    type: "register" as const,
    email,
    name: googleUser.name,
  };
}

export async function completeRegistrationWithGoogle(
  credential: string,
  payload: RegisterCompletePayload
) {
  const googleUser = await verifyGoogleIdToken(credential);

  if (!googleUser.emailVerified) {
    throw new Error("Your Google email must be verified");
  }

  const email = normalizeEmail(googleUser.email);
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
  if (sections.length === 0) {
    throw new Error("At least one expense section is required");
  }

  const existingProfile = await findActiveProfileByEmail(email);
  if (existingProfile) {
    throw new Error("This Google account already has a CompApp profile");
  }

  const { data: existingCompany } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingCompany) {
    throw new Error("A company with this email is already registered");
  }

  const pendingInvite = await findPendingInvitationByEmail(email);
  if (pendingInvite) {
    throw new Error(
      "You have a pending team invitation — sign in instead of registering"
    );
  }

  if (teamMembers.some((m) => m.email === email)) {
    throw new Error("You cannot invite yourself");
  }

  const slug = await ensureUniqueSlug(payload.company.name.trim());
  const companyName = payload.company.name.trim();

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .insert({
      name: companyName,
      slug,
      location: payload.company.location.trim(),
      phone: payload.company.phone.trim(),
      email,
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
      email,
      email_confirm: true,
      user_metadata: {
        full_name: googleUser.name,
        avatar_url: googleUser.picture,
        google_sub: googleUser.sub,
      },
    });

  if (authError || !authUser.user) {
    throw new Error(authError?.message ?? "Failed to create owner account");
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: authUser.user.id,
    company_id: company.id,
    email,
    full_name: googleUser.name,
    first_name: googleUser.givenName || null,
    last_name: googleUser.familyName || null,
    avatar_url: googleUser.picture ?? null,
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
  }

  const session = await createDeviceSession(authUser.user.id);

  return {
    companyId: company.id,
    deviceToken: session.deviceToken,
    expiresAt: session.expiresAt,
    invitationsSent,
  };
}

export async function completeInviteWithGoogle(
  credential: string,
  firstName: string,
  lastName: string,
  phone: string
) {
  const googleUser = await verifyGoogleIdToken(credential);

  if (!googleUser.emailVerified) {
    throw new Error("Your Google email must be verified");
  }

  const email = normalizeEmail(googleUser.email);
  const first = firstName.trim() || googleUser.givenName;
  const last = lastName.trim() || googleUser.familyName;
  const phoneE164 = normalizePhoneE164(phone);

  if (!first || !last) {
    throw new Error("First name and last name are required");
  }
  if (!phoneE164) {
    throw new Error("Valid WhatsApp phone number is required");
  }

  const existingProfile = await findActiveProfileByEmail(email);
  if (existingProfile) {
    throw new Error("You already have an account — sign in instead");
  }

  const invite = await findPendingInvitationByEmail(email);
  if (!invite) {
    throw new Error("No pending invitation found for this Google account");
  }

  const { data: existingPhone } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("id")
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  if (existingPhone) {
    throw new Error("This WhatsApp number is already linked to an account");
  }

  const fullName = `${first} ${last}`;

  const { data: authUser, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        avatar_url: googleUser.picture,
        google_sub: googleUser.sub,
      },
    });

  if (authError || !authUser.user) {
    throw new Error(authError?.message ?? "Failed to create account");
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: authUser.user.id,
    company_id: invite.companyId,
    email,
    phone: phoneE164,
    first_name: first,
    last_name: last,
    full_name: fullName,
    avatar_url: googleUser.picture ?? null,
    role: invite.role,
  });

  if (profileError) {
    throw new Error(profileError.message);
  }

  const { error: waError } = await supabaseAdmin.from("whatsapp_accounts").insert({
    profile_id: authUser.user.id,
    phone_e164: phoneE164,
    linked_at: new Date().toISOString(),
    conversation_state: { step: "idle" },
  });

  if (waError) {
    throw new Error(waError.message);
  }

  await supabaseAdmin
    .from("invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invite.id);

  const { data: sections } = await supabaseAdmin
    .from("expense_sections")
    .select("id, name")
    .eq("company_id", invite.companyId)
    .eq("is_active", true)
    .order("sort_order");

  const welcome = `Welcome to ${invite.companyName}! Upload receipts here — pick a section first.`;
  await sendText(phoneE164, welcome);
  await sendSectionPicker(
    phoneE164,
    invite.companyName,
    (sections ?? []).map((s) => ({ id: s.id, name: s.name }))
  );

  const session = await createDeviceSession(authUser.user.id);

  return {
    profileId: authUser.user.id,
    companyId: invite.companyId,
    deviceToken: session.deviceToken,
    expiresAt: session.expiresAt,
  };
}
