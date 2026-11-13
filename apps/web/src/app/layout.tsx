import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { getMessages } from "@/lib/i18n";
import { authConfig, currentUser } from "@/lib/server";

export const metadata: Metadata = {
  title: { default: "Build Hub · Escape from Tarkov", template: "%s · Build Hub" },
  description: "Waffen-Builds für Escape from Tarkov bauen, teilen und weiterentwickeln – geprüft gegen echte Spieldaten.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ locale, t }, user] = await Promise.all([getMessages(), currentUser()]);
  const path = (await headers()).get("x-tbh-path") ?? "/";
  return (
    <html lang={locale}>
      <body>
        <a href="#inhalt" className="visually-hidden">
          Zum Inhalt
        </a>
        <SiteHeader user={user} t={t} loginEnabled={authConfig() !== null} path={path} />
        <main id="inhalt" style={{ minHeight: "calc(100vh - 160px)" }}>
          {children}
        </main>
        <footer style={{ marginTop: 96, borderTop: "1px solid var(--line)" }}>
          <div className="container" style={{ padding: "28px 32px", display: "flex", flexWrap: "wrap", gap: "8px 32px", fontSize: 13, color: "var(--faint)" }}>
            <span>{t.footer_fan}</span>
            <span>{t.footer_data}</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
