import Link from "next/link";
import { getMessages } from "@/lib/i18n";

export default async function NotFound() {
  const { t } = await getMessages();
  return (
    <div className="container" style={{ paddingTop: 80, maxWidth: 640 }}>
      <p className="head num" style={{ color: "var(--accent)", fontSize: 18, margin: 0 }}>
        404
      </p>
      <h1 className="head" style={{ fontSize: 44, margin: "4px 0 12px" }}>
        {t.not_found_title}
      </h1>
      <p style={{ color: "var(--ink-2)", fontSize: 18, margin: "0 0 28px" }}>{t.not_found_text}</p>
      <Link className="btn" href="/">
        {t.back_home}
      </Link>
    </div>
  );
}
