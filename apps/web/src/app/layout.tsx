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
import { authConfig, currentUser, isStaff } from "@/lib/server";
import { siteSettings } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: "Build Hub · Escape from Tarkov", template: "%s · Build Hub" },
  description: "Waffen-Builds für Escape from Tarkov bauen, teilen und weiterentwickeln – geprüft gegen echte Spieldaten.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ locale, t }, user, settings] = await Promise.all([getMessages(), currentUser(), siteSettings()]);
  const maintenanceBlocks = settings.maintenance.enabled && !isStaff(user);
  const path = (await headers()).get("x-tbh-path") ?? "/";
  return (
    <html lang={locale}>
      <body>
        <a href="#inhalt" className="visually-hidden">
          Zum Inhalt
        </a>
        {settings.banner.enabled && settings.banner.text && (
          <div role="status" style={{ padding: "8px 16px", background: "#2a2414", borderBottom: "1px solid #4a3b22", color: "#e9d29a", fontSize: 14, textAlign: "center" }}>
            {settings.banner.text}
          </div>
        )}
        {settings.maintenance.enabled && !maintenanceBlocks && (
          <div role="status" style={{ padding: "6px 16px", background: "var(--bad-bg)", color: "#f0b49e", fontSize: 13, textAlign: "center" }}>
            {t.maintenance_staff}
          </div>
        )}
        <SiteHeader user={user} t={t} loginEnabled={authConfig() !== null} path={path} />
        <main id="inhalt" style={{ minHeight: "calc(100vh - 160px)" }}>
          {maintenanceBlocks && !path.startsWith("/auth/") ? (
            <div className="container" style={{ padding: "80px 32px" }}>
              <h1 className="head" style={{ fontSize: 44, margin: 0 }}>
                {t.maintenance_title}
              </h1>
              <p style={{ color: "var(--muted)", maxWidth: 560 }}>{t.maintenance_text}</p>
            </div>
          ) : (
            children
          )}
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
