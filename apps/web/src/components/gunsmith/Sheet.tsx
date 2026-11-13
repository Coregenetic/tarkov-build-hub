"use client";

import { useEffect, useRef } from "react";
import s from "./gunsmith.module.css";

/** Unteres Blatt für schmale Bildschirme: modal, schließt mit Escape, Hintergrund oder Knopf. */
export function Sheet({ children, onClose, closeLabel }: { children: React.ReactNode; onClose: () => void; closeLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  return (
    <>
      <div className={s.backdrop} onClick={onClose} aria-hidden="true" />
      <div ref={ref} className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabIndex={-1}>
        <div className={s.sheetTop}>
          <span className={s.grip} aria-hidden="true" style={{ margin: 0 }} />
          <button type="button" className={s.sheetClose} onClick={onClose} aria-label={closeLabel}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
