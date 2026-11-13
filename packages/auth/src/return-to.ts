/**
 * Nach dem Login nur auf eigene Seiten zurückleiten (Schutz vor Open-Redirect).
 * Erlaubt: "/", "/builds/abc?x=1". Abgelehnt: "//evil.com", "/\\evil.com", "https://…", Steuerzeichen.
 */
export function safeReturnTo(value: string | null | undefined, fallback = "/"): string {
  if (!value || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://example.invalid");
    if (url.origin !== "https://example.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
