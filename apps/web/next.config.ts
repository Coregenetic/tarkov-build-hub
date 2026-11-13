import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    // Skripte mit Nonce folgen in Phase 9 (Härtung); bis dahin ist die Richtlinie bewusst eng bei Bildern, Frames und Formularen.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: https://static-cdn.jtvnw.net https://assets.tarkov.dev",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self' https://id.twitch.tv",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@tbh/auth", "@tbh/db", "@tbh/compat-engine", "@tbh/game-data", "@tbh/data-adapters", "@tbh/builds", "@tbh/import"],
  serverExternalPackages: ["postgres"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
