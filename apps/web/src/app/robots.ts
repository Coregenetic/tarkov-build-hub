import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env["PUBLIC_BASE_URL"] ?? "http://127.0.0.1:3002";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/auth/", "/einstellungen", "/me", "/lang"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
