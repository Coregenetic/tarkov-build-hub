import type { NextConfig } from "next";

/** Die Inhaltsrichtlinie (CSP) setzt src/proxy.ts – mit Nonce je Anfrage. */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
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
