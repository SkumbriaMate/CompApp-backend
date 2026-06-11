import { randomBytes } from "node:crypto";
import { getFrontendUrl } from "../lib/frontend-url.js";
import { supabaseAdmin } from "../lib/supabase.js";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function findPendingInvitationByEmail(email: string) {
  const normalized = normalizeEmail(email);

  const { data, error } = await supabaseAdmin
    .from("invitations")
    .select(
      `
      id,
      company_id,
      email,
      role,
      expires_at,
      company:companies(id, name)
    `
    )
    .eq("email", normalized)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (new Date(data.expires_at) < new Date()) {
    return null;
  }

  const company = Array.isArray(data.company) ? data.company[0] : data.company;

  return {
    id: data.id,
    companyId: data.company_id,
    email: data.email,
    role: data.role as "manager" | "employee" | "accountant",
    companyName: company?.name ?? "CompApp",
  };
}

export async function listInvitations(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("invitations")
    .select("id, email, role, status, sent_at, created_at, expires_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

export async function createInvitation(
  companyId: string,
  invitedBy: string,
  email: string,
  role: "manager" | "employee" | "accountant"
) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error("Email is required");
  }

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("company_id", companyId)
    .eq("email", normalizedEmail)
    .eq("is_active", true)
    .maybeSingle();

  if (existingProfile) {
    throw new Error("This person is already on your team");
  }

  const { data: pendingInvite } = await supabaseAdmin
    .from("invitations")
    .select("id")
    .eq("company_id", companyId)
    .eq("email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingInvite) {
    throw new Error("An invitation is already pending for this email");
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("invitations")
    .insert({
      company_id: companyId,
      email: normalizedEmail,
      role,
      invited_by: invitedBy,
      token,
      status: "pending",
      expires_at: expiresAt,
      sent_at: new Date().toISOString(),
    })
    .select("id, email, role, status, sent_at, created_at, expires_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to send invitation");
  }

  if (process.env.NODE_ENV !== "production") {
    const base = getFrontendUrl();
    console.log(
      `[INVITE] ${normalizedEmail} (${role}) → sign in at ${base}/ka/login with this Google account`
    );
  }

  return {
    id: data.id,
    email: data.email,
    role: data.role,
    status: data.status,
    sentAt: data.sent_at,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
    token,
  };
}

export async function revokeInvitation(
  companyId: string,
  invitationId: string
) {
  const { data: invite, error: fetchError } = await supabaseAdmin
    .from("invitations")
    .select("id, status")
    .eq("id", invitationId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (fetchError || !invite) {
    throw new Error("Invitation not found");
  }

  if (invite.status !== "pending") {
    throw new Error("Only pending invitations can be removed");
  }

  const { error } = await supabaseAdmin
    .from("invitations")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (error) {
    throw new Error(error.message);
  }

  return { id: invitationId };
}
