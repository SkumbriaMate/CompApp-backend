/** FRONTEND_URL without trailing slash — required for CORS origin matching. */
export function getFrontendUrl() {
  const raw = process.env.FRONTEND_URL ?? "http://localhost:3000";
  return raw.trim().replace(/\/+$/, "");
}
