"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Bewusst zweisprachig: Im Fehlerfall steht die Spracheinstellung nicht sicher zur Verfügung.
  return (
    <div className="container" style={{ paddingTop: 80, maxWidth: 640 }}>
      <h1 className="head" style={{ fontSize: 44, margin: "0 0 12px" }}>
        Etwas ist schiefgelaufen
      </h1>
      <p style={{ color: "var(--ink-2)", fontSize: 18, margin: "0 0 28px" }}>
        Bitte versuche es gleich noch einmal. · Something went wrong, please try again.
      </p>
      <button className="btn" type="button" onClick={reset}>
        Erneut versuchen
      </button>
    </div>
  );
}
