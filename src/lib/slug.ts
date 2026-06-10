export function slugifyCompanyName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return base || "company";
}

export function uniqueSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
