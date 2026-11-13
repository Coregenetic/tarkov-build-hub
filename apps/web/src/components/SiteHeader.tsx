import Link from "next/link";
import type { SessionUser } from "@tbh/auth";
import type { Messages } from "@/lib/i18n";

export function SiteHeader({ user, t, loginEnabled, path }: { user: SessionUser | null; t: Messages; loginEnabled: boolean; path: string }) {
  return (
    <header className="site-header" style={{ borderBottom: "1px solid var(--line)", background: "var(--bg-raised)" }}>
      <div className="container site-header-row" style={{ minHeight: 68, display: "flex", flexWrap: "wrap", gap: "12px 32px", alignItems: "center", paddingTop: 10, paddingBottom: 10 }}>
        <Link href="/" className="head" style={{ color: "var(--ink)", fontSize: 24, fontWeight: 700, letterSpacing: "0.04em" }}>
          BUILD HUB
        </Link>
        <nav aria-label="Hauptmenü" className="site-nav" style={{ display: "flex", gap: 24, fontSize: 15, fontWeight: 500 }}>
          <Link href="/" style={{ color: path === "/" ? "var(--ink)" : "var(--muted)" }} aria-current={path === "/" ? "page" : undefined}>
            {t.nav_discover}
          </Link>
 <Link href="/builds" style={{ color: path.startsWith("/builds") ? "var(--ink)" : "var(--muted)" }} aria-current={path.startsWith("/builds") ? "page" : undefined}>
            {t.nav_builds}
          </Link>
          <Link href="/gunsmith" style={{ color: path.startsWith("/gunsmith") ? "var(--ink)" : "var(--muted)" }} aria-current={path.startsWith("/gunsmith") ? "page" : undefined}>
            {t.nav_gunsmith}
          </Link>
        </nav>
        <span className="site-spacer" style={{ flex: 1 }} />
        {(user?.role === "moderator" || user?.role === "admin") && (
          <Link href="/admin" style={{ color: path.startsWith("/admin") ? "var(--ink)" : "var(--accent)", fontSize: 14, fontWeight: 600 }}>
            {t.nav_admin}
          </Link>
        )}
        <Link href={`/einstellungen?back=${encodeURIComponent(path)}`} style={{ color: path.startsWith("/einstellungen") ? "var(--ink)" : "var(--muted)", fontSize: 14 }}>
          {t.nav_settings}
        </Link>
        <a href={`/lang?back=${encodeURIComponent(path)}`} style={{ color: "var(--muted)", fontSize: 14 }} hrefLang={t.language === "English" ? "en" : "de"}>
          {t.language}
        </a>
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href={`/u/${user.login}`} style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink)" }}>
              <Avatar url={user.avatarUrl} name={user.displayName} size={32} />
              <span style={{ fontWeight: 600 }}>{user.displayName}</span>
            </Link>
            <form action="/auth/logout" method="post">
              <button type="submit" className="btn" style={{ minHeight: 38, padding: "0 14px", fontSize: 14 }}>
                {t.logout}
              </button>
            </form>
          </div>
        ) : loginEnabled ? (
          <a className="btn btn-light site-login" href={`/auth/twitch/login?returnTo=${encodeURIComponent(path)}`}>
            <span className="hide-sm">{t.login}</span>
            <span className="show-sm">{t.login_short}</span>
          </a>
        ) : (
          <span className="btn site-login" aria-disabled="true" title={t.login_disabled}>
            <span className="hide-sm">{t.login_disabled}</span>
            <span className="show-sm">{t.login_disabled_short}</span>
          </span>
        )}
      </div>
    </header>
  );
}

export function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  const style = { width: size, height: size, borderRadius: 6, flex: "none" as const, background: "var(--panel-2)", objectFit: "cover" as const };
  if (!url) {
    return (
      <span aria-hidden="true" style={{ ...style, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "var(--muted)", fontSize: size * 0.45 }}>
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  // Twitch-Avatare kommen von static-cdn.jtvnw.net; kein Referrer an Dritte.
  return <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer" style={style} />;
}
