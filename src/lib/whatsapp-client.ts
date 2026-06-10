const GRAPH = "https://graph.facebook.com/v21.0";

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
  );
}

function phoneNumberId() {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");
  return id;
}

function accessToken() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN is not set");
  return token;
}

type SendResult = { ok: true; messageId?: string } | { ok: false; error: string };

async function sendPayload(to: string, payload: object): Promise<SendResult> {
  const normalizedTo = to.replace(/\D/g, "");

  if (!isWhatsAppConfigured()) {
    console.log("[WhatsApp mock]", normalizedTo, JSON.stringify(payload, null, 2));
    return { ok: true, messageId: "mock" };
  }

  const res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizedTo,
      ...payload,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message: string };
  };

  if (!res.ok) {
    const msg = data.error?.message ?? `WhatsApp API ${res.status}`;
    console.error("[WhatsApp send error]", msg, data);
    return { ok: false, error: msg };
  }

  return { ok: true, messageId: data.messages?.[0]?.id };
}

export async function sendText(to: string, body: string): Promise<SendResult> {
  return sendPayload(to, {
    type: "text",
    text: { body },
  });
}

export type SectionOption = { id: string; name: string };

export async function sendSectionPicker(
  to: string,
  companyName: string,
  sections: SectionOption[]
): Promise<SendResult> {
  if (sections.length === 0) {
    return sendText(to, `${companyName}: no expense sections configured yet.`);
  }

  if (sections.length <= 3) {
    return sendPayload(to, {
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: `${companyName}\nChoose a section, then send your receipt photo.`,
        },
        action: {
          buttons: sections.slice(0, 3).map((s) => ({
            type: "reply",
            reply: { id: `section:${s.id}`, title: s.name.slice(0, 20) },
          })),
        },
      },
    });
  }

  return sendPayload(to, {
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: `${companyName}\nChoose a section, then send your receipt photo.`,
      },
      action: {
        button: "Sections",
        sections: [
          {
            title: "Expense sections",
            rows: sections.slice(0, 10).map((s) => ({
              id: `section:${s.id}`,
              title: s.name.slice(0, 24),
            })),
          },
        ],
      },
    },
  });
}

export async function downloadMedia(mediaId: string): Promise<Buffer | null> {
  if (!isWhatsAppConfigured()) return null;

  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  const meta = (await metaRes.json()) as { url?: string };
  if (!meta.url) return null;

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  if (!fileRes.ok) return null;

  return Buffer.from(await fileRes.arrayBuffer());
}
