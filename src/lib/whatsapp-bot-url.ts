/** Public wa.me link — opens chat with START prefilled. */
export function buildWhatsAppBotUrl() {
  const digits = process.env.WHATSAPP_BUSINESS_PHONE?.replace(/\D/g, "") ?? "";
  if (!digits) {
    return null;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent("START")}`;
}
