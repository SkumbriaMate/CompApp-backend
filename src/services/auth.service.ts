import { supabaseAdmin } from "../lib/supabase.js";
import {
  ensureCompanyOwnerRole,
  findActiveProfileByEmail,
  isManagerOrOwner,
} from "./profile-role.service.js";

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
