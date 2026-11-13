"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  extId: string;
  lang: "de" | "en";
  field: "name" | "short_name";
  /** Wert der Quelle (wird mitprotokolliert). */
  sourceValue: string;
  /** Vorbelegung: Vorschlag oder aktueller eigener Name. */
  initial: string;
}

/** Eigenen Anzeigenamen setzen. Speichert über /api/admin/action, protokolliert vorher/nachher. */
export function NameEditor({ extId, lang, field, sourceValue, initial }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputStyle = { height: 34, padding: "0 10px", borderRadius: 6, border: "1px solid var(--line-strong)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 14 } as const;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        const res = await fetch("/api/admin/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "name.set", extId, lang, field, value, note, sourceValue }),
        }).catch(() => null);
        const json = (await res?.json().catch(() => ({}))) as { message?: string } | undefined;
        if (!res?.ok) {
          setError(json?.message ?? "Speichern fehlgeschlagen.");
          setState("idle");
          return;
        }
        setState("saved");
        router.refresh();
      }}
      style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}
    >
      <label className="visually-hidden" htmlFor={`n-${extId}-${lang}-${field}`}>
        Neuer Name
      </label>
      <input id={`n-${extId}-${lang}-${field}`} value={value} onChange={(e) => (setValue(e.target.value), setState("idle"))} maxLength={120} required style={{ ...inputStyle, minWidth: 220, flex: "1 1 220px" }} />
      <label className="visually-hidden" htmlFor={`note-${extId}-${lang}-${field}`}>
        Notiz
      </label>
      <input id={`note-${extId}-${lang}-${field}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz (optional)" maxLength={500} style={{ ...inputStyle, width: 160 }} />
      <button type="submit" className="btn btn-primary" disabled={state === "busy" || value.trim() === "" || value === sourceValue} style={{ minHeight: 34, padding: "0 12px", fontSize: 13 }}>
        {state === "saved" ? "Gespeichert" : "Speichern"}
      </button>
      {error && (
        <span role="alert" style={{ color: "var(--bad)", fontSize: 13, flexBasis: "100%" }}>
          {error}
        </span>
      )}
    </form>
  );
}
