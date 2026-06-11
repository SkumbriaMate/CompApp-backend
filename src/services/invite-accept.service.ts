import { normalizePhoneE164 } from "../lib/phone.js";
import { sendSectionPicker, sendText } from "../lib/whatsapp-client.js";
import { supabaseAdmin } from "../lib/supabase.js";

export async function getInvitationByToken(token: string) {
  const { data, error } = await supabaseAdmin
    .from("invitations")
    .select(
      `
      id,
      email,
      role,
      status,
      expires_at,
      company:companies(id, name)
    `
    )
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Invitation not found");
  }

  if (data.status !== "pending") {
    throw new Error("This invitation is no longer valid");
  }

  if (new Date(data.expires_at) < new Date()) {
    throw new Error("This invitation has expired");
  }

  const company = Array.isArray(data.company) ? data.company[0] : data.company;

  return {
    email: data.email,
    role: data.role,
    companyId: company?.id ?? "",
    companyName: company?.name ?? "",
  };
}

export async function acceptInvitation(
  token: string,
  firstName: string,
  lastName: string,
  phone: string
) {
  const first = firstName.trim();
  const last = lastName.trim();
  const phoneE164 = normalizePhoneE164(phone);

  if (!first || !last) {
    throw new Error("First name and last name are required");
  }
  if (!phoneE164) {
    throw new Error("Valid WhatsApp phone number is required");
  }

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();

  if (inviteError || !invite) {
    throw new Error("Invitation not found or already used");
  }

  if (new Date(invite.expires_at) < new Date()) {
    throw new Error("This invitation has expired");
  }

  const { data: existingPhone } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("id")
    .eq("phone_e164", phoneE164)
    .eq("is_active", true)
    .maybeSingle();

  if (existingPhone) {
    throw new Error("This WhatsApp number is already linked to an account");
  }

  const fullName = `${first} ${last}`;

  const { data: authUser, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

  if (authError || !authUser.user) {
    throw new Error(authError?.message ?? "Failed to create account");
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: authUser.user.id,
    company_id: invite.company_id,
    email: invite.email,
    phone: phoneE164,
    first_name: first,
    last_name: last,
    full_name: fullName,
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

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("name")
    .eq("id", invite.company_id)
    .single();

  const { data: sections } = await supabaseAdmin
    .from("expense_sections")
    .select("id, name")
    .eq("company_id", invite.company_id)
    .eq("is_active", true)
    .order("sort_order");

  const welcome = `Welcome to ${company?.name ?? "CompApp"}! Upload receipts here — pick a section first.`;
  await sendText(phoneE164, welcome);
  await sendSectionPicker(
    phoneE164,
    company?.name ?? "CompApp",
    (sections ?? []).map((s) => ({ id: s.id, name: s.name }))
  );

  return { profileId: authUser.user.id, companyId: invite.company_id };
}
