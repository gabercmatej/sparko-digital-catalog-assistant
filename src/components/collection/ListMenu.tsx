"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import styles from "./ListMenu.module.css";

export type ListMenuItem = { label: string; icon: "share" | "trash"; danger?: boolean; onSelect: () => void };

/** The "⋮" button of the Moj katalog header with a small popover menu (Esc / outside tap closes). */
export function ListMenu({ items, disabled }: { items: ListMenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="icon-btn"
        aria-label="Več možnosti"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more-vertical" size={24} strokeWidth={3} />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Moj katalog" className={styles.menu}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`${styles.item}${it.danger ? ` ${styles.danger}` : ""}`}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              <Icon name={it.icon} size={18} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
