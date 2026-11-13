import Link from "next/link";

/** Einfache Blätter-Leiste für Admin-Tabellen. */
export function Pager({ page, total, perPage, href }: { page: number; total: number; perPage: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Seiten" style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
      {page > 1 ? (
        <Link className="btn" href={href(page - 1)} style={{ minHeight: 36 }}>
          ← Zurück
        </Link>
      ) : null}
      <span style={{ fontSize: 13, color: "var(--faint)" }}>
        Seite {page} von {pages}
      </span>
      {page < pages ? (
        <Link className="btn" href={href(page + 1)} style={{ minHeight: 36 }}>
          Weiter →
        </Link>
      ) : null}
    </nav>
  );
}
