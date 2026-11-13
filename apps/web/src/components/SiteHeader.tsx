import Link from "next/link";
import type { SessionUser } from "@tbh/auth";
import type { Messages } from "@/lib/i18n";

export function SiteHeader({ user, t, loginEnabled, path }: { user: SessionUser | null; t: Messages; loginEnabled: boolean; path: string }) {
  return (
    <header style={{ borderBottom: "1px solid var(--line)", background: "var(--bg-raised)" }}>
      <div className="container" style={{ minHeight: 68, display: "flex", flexWrap: "wrap", gap: "12px 32px", alignItems: "center", paddingTop: 10, paddingBottom: 10 }}>
        <Link href="/" className="head" style={{ color: "var(--ink)", fontSize: 24, fontWeight: 700, letterSpacing: "0.04em" }}>
          BUILD HUB
        </Link>
        <nav aria-label="Hauptmenü" style={{ display: "flex", gap: 24, fontSize: 15, fontWeight: 500 }}>
          <Link href="/" style={{ color: path === "/" ? "var(--ink)" : "var(--muted)" }} aria-current={path === "/" ? "page" : undefined}>
            {t.nav_discover}
          </Link>
          <span style={{ color: "var(--faint)" }} title="Folgt in Phase 5">
            {t.nav_gunsmith}
          </span>
        </nav>
        <span style={{ flex: 1 }} />
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
          <a className="btn btn-light" href={`/auth/twitch/login?returnTo=${encodeURIComponent(path)}`}>
            {t.login}
          </a>
        ) : (
          <span className="btn" aria-disabled="true">
            {t.login_disabled}
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
