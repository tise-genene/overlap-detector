import crypto from "crypto";

export function normalizeContact(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]/g, "");
}

export function hashPartner(normalized: string): string {
  const salt = process.env.HASH_SALT;
  if (!salt) throw new Error("HASH_SALT is not set");
  return crypto
    .createHash("sha256")
    .update(`${salt}|${normalized}`)
    .digest("hex");
}
