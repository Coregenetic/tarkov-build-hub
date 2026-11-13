import type { Metadata } from "next";
import Link from "next/link";
import { getMessages, type MessageKey } from "@/lib/i18n";

export const metadata: Metadata = { title: "Anmeldung", robots: { index: false } };

const KNOWN = new Set([
  "denied",
  "invalid_state",
  "expired_state",
  "token_exchange_failed",
  "invalid_id_token",
  "profile_failed",
  "banned",
  "rate_limited",
  "disabled",
]);

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { t } = await getMessages();
  const { code } = await searchParams;
  const key = (KNOWN.has(code ?? "") ? `auth_error_${code}` : "auth_error_unknown") as MessageKey;
  const canRetry = code !== "banned" && code !== "disabled";
  return (
    <div className="container" style={{ paddingTop: 80, maxWidth: 640 }}>
      <h1 className="head" style={{ fontSize: 44, margin: "0 0 12px" }}>
        {t.auth_error_title}
      </h1>
      <p style={{ color: "var(--ink-2)", fontSize: 18, margin: "0 0 28px" }} role="alert">
        {t[key]}
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {canRetry && (
          <a className="btn btn-light" href="/auth/twitch/login">
            {t.auth_error_try_again}
          </a>
        )}
        <Link className="btn" href="/">
          {t.back_home}
        </Link>
      </div>
    </div>
  );
}
