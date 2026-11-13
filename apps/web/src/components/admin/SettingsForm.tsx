"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Hinweisbanner und Wartungsmodus. Wartung sperrt alle außer dem Team aus (Seiten und API). */
export function SettingsForm({ banner, maintenance }: { banner: { enabled: boolean; text: string }; maintenance: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(banner.text);
  const [on, setOn] = useState(banner.enabled);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "setting.update", ...payload }) }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
    setBusy(false);
    if (!res?.ok) return setMsg({ ok: false, text: json?.message ?? "Speichern fehlgeschlagen." });
    setMsg({ ok: true, text: "Gespeichert." });
    router.refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 16 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send({ banner: { enabled: on, text } });
        }}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        <label htmlFor="banner-text" style={{ fontWeight: 600 }}>
          Hinweisbanner
        </label>
        <input
          id="banner-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder="z. B. Neuer Patch – Spieldaten werden heute Abend aktualisiert."
          style={{ height: 40, padding: "0 12px", borderRadius: 6, border: "1px solid var(--line-strong)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 14 }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Für alle anzeigen
          </label>
          <span style={{ fontSize: 12, color: "var(--faint)" }}>{text.length}/200</span>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ minHeight: 36, marginLeft: "auto" }}>
            Banner speichern
          </button>
        </div>
      </form>

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 600 }}>Wartungsmodus {maintenance ? <span style={{ color: "var(--bad)" }}>· aktiv</span> : null}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Besucher sehen eine Wartungsseite, Änderungen über die API sind gesperrt. Admins und Moderatoren arbeiten weiter.</div>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={() => void send({ maintenance: { enabled: !maintenance } })} style={maintenance ? undefined : { color: "#f09a78", borderColor: "#5a2e22" }}>
          {maintenance ? "Wartung beenden" : "Wartung einschalten"}
        </button>
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} style={{ margin: 0, fontSize: 13, color: msg.ok ? "var(--ok)" : "var(--bad)" }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
