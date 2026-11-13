"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  /** Daten für /api/admin/action (enthält type). */
  payload: Record<string, unknown>;
  label: string;
  /** Vor dem Ausführen nach einem Grund fragen. */
  needsReason?: boolean;
  /** Zusätzliches Feld (z. B. Patch-Bezeichnung) statt Grund. */
  input?: { name: string; label: string; placeholder?: string };
  danger?: boolean;
  primary?: boolean;
  confirmLabel?: string;
  small?: boolean;
}

/**
 * Knopf für eine Admin-Aktion. Fragt bei Bedarf nach Grund oder Eingabe, schickt die Aktion,
 * leitet bei „frische Anmeldung nötig“ zur Twitch-Bestätigung und lädt danach die Seite neu.
 */
export function AdminAction({ payload, label, needsReason, input, danger, primary, confirmLabel, small }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asks = needsReason || input;
  const cls = `btn${primary ? " btn-primary" : ""}`;
  const style = { ...(small ? { minHeight: 34, padding: "0 10px", fontSize: 13 } : {}), ...(danger ? { color: "#f09a78", borderColor: "#5a2e22" } : {}) };

  const run = async () => {
    setBusy(true);
    setError(null);
    const body = { ...payload, ...(needsReason ? { reason: value } : {}), ...(input ? { [input.name]: value } : {}) };
    try {
      const res = await fetch("/api/admin/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (json.error === "reauth_required") {
        window.location.assign(`/auth/twitch/login?reauth=1&returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return;
      }
      if (!res.ok) throw new Error(json.message ?? String(res.status));
      setOpen(false);
      setValue("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  };

  if (asks && open) {
    const fieldLabel = input?.label ?? "Grund (Pflicht, sieht der Ersteller)";
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: "var(--faint)" }}>
          {fieldLabel}
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={input?.placeholder}
            maxLength={300}
            required
            minLength={2}
            style={{ height: 34, padding: "0 10px", borderRadius: 6, border: "1px solid var(--line-strong)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 14, minWidth: 180 }}
          />
        </label>
        <button type="submit" className={cls} disabled={busy || value.trim().length < 2} style={style}>
          {confirmLabel ?? label}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)} style={small ? { minHeight: 34, padding: "0 10px", fontSize: 13 } : undefined}>
          Abbrechen
        </button>
        {error && (
          <span role="alert" style={{ color: "var(--bad)", fontSize: 13, flexBasis: "100%" }}>
            {error}
          </span>
        )}
      </form>
    );
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button type="button" className={cls} disabled={busy} onClick={() => (asks ? setOpen(true) : void run())} style={style}>
        {busy ? "…" : label}
      </button>
      {error && (
        <span role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
          {error}
        </span>
      )}
    </span>
  );
}
