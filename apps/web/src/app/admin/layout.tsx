import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import s from "@/components/admin/admin.module.css";
import { openReportTargets, requireStaffPage } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = await requireStaffPage();
  const open = await openReportTargets();
  const groups = [
    {
      title: "Betrieb",
      items: [{ href: "/admin", label: "Übersicht" }, ...(isAdmin ? [{ href: "/admin/statistiken", label: "Statistiken" }] : [])],
    },
    ...(isAdmin
      ? [
          {
            title: "Spieldaten",
            items: [
              { href: "/admin/namen", label: "Item-Namen" },
              { href: "/admin/import", label: "Datenimport" },
            ],
          },
        ]
      : []),
    {
      title: "Community",
      items: [
        { href: "/admin/builds", label: "Builds" },
        { href: "/admin/meldungen", label: "Meldungen", badge: open },
        { href: "/admin/nutzer", label: "Nutzer" },
      ],
    },
    ...(isAdmin
      ? [
          {
            title: "System",
            items: [
              { href: "/admin/protokoll", label: "Protokoll" },
              { href: "/admin/system", label: "System" },
            ],
          },
        ]
      : []),
  ];
  return (
    <div className={s.shell}>
      <AdminNav groups={groups} />
      <div className={s.main}>{children}</div>
    </div>
  );
}
