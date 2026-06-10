/** Normalize to E.164 for Georgia (+995…) */
export function normalizePhoneE164(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("995") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.length === 9) {
    return `+995${digits}`;
  }
  if (input.startsWith("+")) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export function phonesMatch(a: string, b: string): boolean {
  return normalizePhoneE164(a) === normalizePhoneE164(b);
}
