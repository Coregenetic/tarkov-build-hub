import Link from "next/link";
import s from "@/components/gunsmith/gunsmith.module.css";

export interface BuildCardItem {
  href: string;
  title: string;
  weapon: string;
  img: string | null;
  meta: string;
  badge: string | null;
}

/** Kartenraster für Builds und Entwürfe (Profil, später Feed und Suche). */
export function BuildCards({ items }: { items: BuildCardItem[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
      {items.map((b) => (
        <li key={b.href}>
          <Link href={b.href} className={s.card} style={{ height: "100%" }}>
            <span className={s.cardImg} style={{ height: 110 }}>
              {b.img && <img src={b.img} alt="" loading="lazy" decoding="async" style={{ maxHeight: 96 }} />}
            </span>
            <span className={s.cardName} style={{ fontSize: 17, overflowWrap: "anywhere" }}>
              {b.title}
            </span>
            <span className={s.cardMeta}>{b.weapon}</span>
            <span className={s.cardMeta}>{b.meta}</span>
            {b.badge && <span className="tag" style={{ alignSelf: "flex-start" }}>{b.badge}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
