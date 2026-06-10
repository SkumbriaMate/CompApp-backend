import { createHash, randomInt } from "node:crypto";

export function generateOtpCode(): string {
  return randomInt(100000, 1000000).toString();
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function verifyOtpCode(code: string, hash: string): boolean {
  return hashOtpCode(code) === hash;
}

export function otpExpiresAt(minutes = 10): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}
