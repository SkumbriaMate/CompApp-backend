import { supabaseAdmin } from "../lib/supabase.js";

type Actor = { id: string; role: string };

function canRemoveTarget(actor: Actor, targetRole: string, targetId: string): boolean {
  if (actor.id === targetId) {
    return false;
  }
  if (actor.role === "owner") {
    return targetRole !== "owner" || actor.id !== targetId;
  }
  if (actor.role === "manager") {
    return targetRole === "employee" || targetRole === "accountant";
  }
  return false;
}

export async function listTeamMembers(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, first_name, last_name, phone, role, is_active, created_at")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    role: row.role,
    createdAt: row.created_at,
  }));
}

export async function removeTeamMember(
  companyId: string,
  targetProfileId: string,
  actor: Actor
) {
  const { data: target, error: fetchError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, is_active, company_id")
    .eq("id", targetProfileId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (fetchError || !target) {
    throw new Error("Team member not found");
  }

  if (!target.is_active) {
    throw new Error("This person is already removed");
  }

  if (!canRemoveTarget(actor, target.role, target.id)) {
    if (actor.id === target.id) {
      throw new Error("You cannot remove yourself");
    }
    throw new Error("You do not have permission to remove this person");
  }

  const now = new Date().toISOString();

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ is_active: false, updated_at: now })
    .eq("id", targetProfileId);

  if (profileError) {
    throw new Error(profileError.message);
  }

  await supabaseAdmin
    .from("device_sessions")
    .update({ revoked_at: now })
    .eq("profile_id", targetProfileId)
    .is("revoked_at", null);

  await supabaseAdmin
    .from("whatsapp_accounts")
    .update({ is_active: false, updated_at: now })
    .eq("profile_id", targetProfileId);

  return { id: targetProfileId };
}
