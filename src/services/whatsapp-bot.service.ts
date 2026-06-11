import { phonesMatch } from "../lib/phone.js";
import {
  downloadMedia,
  sendSectionPicker,
  sendText,
} from "../lib/whatsapp-client.js";
import { supabaseAdmin } from "../lib/supabase.js";

type IncomingMessage = {
  from: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string };
    list_reply?: { id: string };
  };
  image?: { id: string; mime_type?: string };
};

type WaAccount = {
  id: string;
  profile_id: string;
  phone_e164: string;
  conversation_state: { step?: string; section_id?: string };
  profile: {
    company_id: string;
    full_name: string;
    company: { name: string } | { name: string }[];
  };
};

async function findAccount(waFrom: string): Promise<WaAccount | null> {
  const { data: accounts } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select(
      `
      id,
      profile_id,
      phone_e164,
      conversation_state,
      profile:profiles!inner(
        company_id,
        full_name,
        company:companies(name)
      )
    `
    )
    .eq("is_active", true);

  if (!accounts?.length) return null;

  for (const row of accounts) {
    if (phonesMatch(row.phone_e164, waFrom)) {
      const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      if (!profile) return null;
      const company = Array.isArray(profile.company)
        ? profile.company[0]
        : profile.company;
      return {
        id: row.id,
        profile_id: row.profile_id,
        phone_e164: row.phone_e164,
        conversation_state: (row.conversation_state as WaAccount["conversation_state"]) ?? {},
        profile: {
          company_id: profile.company_id,
          full_name: profile.full_name,
          company: company ?? { name: "CompApp" },
        },
      };
    }
  }

  return null;
}

async function getSections(companyId: string) {
  const { data } = await supabaseAdmin
    .from("expense_sections")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

async function setState(
  accountId: string,
  state: { step?: string; section_id?: string }
) {
  await supabaseAdmin
    .from("whatsapp_accounts")
    .update({ conversation_state: state, updated_at: new Date().toISOString() })
    .eq("id", accountId);
}

async function createExpenseFromReceipt(
  account: WaAccount,
  sectionId: string,
  mediaId: string
) {
  const section = await supabaseAdmin
    .from("expense_sections")
    .select("id, name")
    .eq("id", sectionId)
    .eq("company_id", account.profile.company_id)
    .maybeSingle();

  if (!section.data) {
    throw new Error("Invalid section");
  }

  let receiptUrl: string | null = null;
  const buffer = await downloadMedia(mediaId);
  if (buffer) {
    const path = `${account.profile.company_id}/${Date.now()}-${mediaId}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("receipts")
      .upload(path, buffer, { contentType: "image/jpeg", upsert: false });

    if (!uploadError) {
      const { data: publicUrl } = supabaseAdmin.storage
        .from("receipts")
        .getPublicUrl(path);
      receiptUrl = publicUrl.publicUrl;
    }
  }

  const { error } = await supabaseAdmin.from("expenses").insert({
    company_id: account.profile.company_id,
    employee_id: account.profile_id,
    section_id: sectionId,
    title: section.data.name,
    amount: 0,
    currency: "GEL",
    status: "submitted",
    source: "whatsapp",
    whatsapp_media_id: mediaId,
    receipt_url: receiptUrl,
    submitted_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
}

export async function handleWhatsAppWebhook(body: unknown) {
  const payload = body as {
    object?: string;
    entry?: {
      changes?: {
        value?: {
          messages?: IncomingMessage[];
          contacts?: { profile?: { name?: string } }[];
        };
      }[];
    }[];
  };

  if (payload.object !== "whatsapp_business_account") return;

  const messages = payload.entry?.[0]?.changes?.[0]?.value?.messages;
  if (!messages?.length) return;

  for (const msg of messages) {
    await handleMessage(msg);
  }
}

async function handleMessage(msg: IncomingMessage) {
  const from = msg.from;
  console.log("[WhatsApp inbound]", from, msg.type);

  const account = await findAccount(from);
  if (!account) {
    await sendText(
      from,
      "You are not registered. Sign in at CompApp with Google using your invited email."
    );
    return;
  }

  const companyName = Array.isArray(account.profile.company)
    ? account.profile.company[0]?.name
    : account.profile.company.name;

  if (msg.type === "interactive") {
    const replyId =
      msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id;
    if (replyId?.startsWith("section:")) {
      const sectionId = replyId.replace("section:", "");
      await setState(account.id, { step: "await_receipt", section_id: sectionId });
      const sections = await getSections(account.profile.company_id);
      const name = sections.find((s) => s.id === sectionId)?.name ?? "section";
      await sendText(from, `Selected: ${name}. Now send the receipt photo.`);
    }
    return;
  }

  if (msg.type === "image" && msg.image?.id) {
    const state = account.conversation_state;
    if (state.step !== "await_receipt" || !state.section_id) {
      await sendSectionPicker(from, companyName ?? "CompApp", await getSections(account.profile.company_id));
      return;
    }

    try {
      await createExpenseFromReceipt(account, state.section_id, msg.image.id);
      await setState(account.id, { step: "idle" });
      await sendText(from, "Receipt saved. Send another photo or pick a section again.");
      await sendSectionPicker(from, companyName ?? "CompApp", await getSections(account.profile.company_id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save receipt";
      await sendText(from, message);
    }
    return;
  }

  if (msg.type === "text") {
    const body = msg.text?.body?.trim().toLowerCase() ?? "";
    if (body === "menu" || body === "sections" || body === "start") {
      await sendSectionPicker(from, companyName ?? "CompApp", await getSections(account.profile.company_id));
      return;
    }
    await sendText(
      from,
      "Reply MENU to see sections, pick one, then send a receipt photo."
    );
  }
}
