"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./admin.module.css";

interface Item {
  href: string;
  label: string;
  badge?: number;
}

/** Seitenleiste des Admin-Bereichs; auf dem Handy eine waagerechte Leiste. */
export function AdminNav({ groups }: { groups: { title: string; items: Item[] }[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));
  return (
    <nav className={s.nav} aria-label="Admin-Bereich">
      {groups.map((g) => (
        <div key={g.title} style={{ display: "contents" }}>
          <div className={s.navHead}>{g.title.toUpperCase()}</div>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className={`${s.navItem} ${active(i.href) ? s.navActive : ""}`} aria-current={active(i.href) ? "page" : undefined}>
              {i.label}
              {i.badge ? (
                <span className={s.badge} aria-label={`${i.badge} offen`}>
                  {i.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
