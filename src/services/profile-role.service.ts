import { supabaseAdmin } from "../lib/supabase.js";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

type ProfileRow = {
  id: string;
  company_id: string;
  email: string;
  role: string;
  is_active?: boolean;
};

/** Company registration email is always the owner. */
export async function ensureCompanyOwnerRole(
  profile: ProfileRow
): Promise<string> {
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("email")
    .eq("id", profile.company_id)
    .maybeSingle();

  if (!company) {
    return profile.role;
  }

  const isCompanyOwner =
    normalizeEmail(company.email) === normalizeEmail(profile.email);

  if (isCompanyOwner && profile.role !== "owner") {
    await supabaseAdmin
      .from("profiles")
      .update({
        role: "owner",
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
    return "owner";
  }

  return profile.role;
}

export async function findActiveProfileByEmail(email: string) {
  const normalized = normalizeEmail(email);

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, company_id, email, is_active, role")
    .eq("email", normalized)
    .eq("is_active", true);

  if (error || !profiles?.length) {
    return null;
  }

  if (profiles.length === 1) {
    return profiles[0];
  }

  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("id, email")
    .in(
      "id",
      profiles.map((p) => p.company_id)
    );

  const ownerCompanyIds = new Set(
    (companies ?? [])
      .filter((c) => normalizeEmail(c.email) === normalized)
      .map((c) => c.id)
  );

  const companyOwnerProfile = profiles.find((p) =>
    ownerCompanyIds.has(p.company_id)
  );
  if (companyOwnerProfile) {
    return companyOwnerProfile;
  }

  const ownerRoleProfile = profiles.find((p) => p.role === "owner");
  if (ownerRoleProfile) {
    return ownerRoleProfile;
  }

  return profiles[0];
}

export function isManagerOrOwner(role: string): boolean {
  return role === "owner" || role === "manager";
}
