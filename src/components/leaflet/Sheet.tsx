"use client";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
import styles from "./Sheet.module.css";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const noopSubscribe = () => () => {};
/** Portal target: the app shell (so the sheet stays inside the centered column, above the nav, below toasts). */
function useShellTarget(): HTMLElement | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => (document.getElementById("main")?.parentElement as HTMLElement | null) ?? document.body,
    () => null,
  );
}

/**
 * Accessible modal used by the leaflet: bottom sheet (product, page picker) or small
 * centered dialog (email placeholder). Scrim click, close button and Esc close it;
 * focus moves into the sheet, is trapped while open and returns to the opener.
 */
export function Sheet({
  open,
  onClose,
  title,
  variant = "sheet",
  children,
  footer,
  hideTitle = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  variant?: "sheet" | "dialog";
  children: React.ReactNode;
  footer?: React.ReactNode;
  hideTitle?: boolean;
}) {
  const target = useShellTarget();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === firstEl || !panel.contains(document.activeElement))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (document.activeElement === lastEl || !panel.contains(document.activeElement))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || !target) return null;

  return createPortal(
    <div className={`${styles.root} ${variant === "dialog" ? styles.dialogRoot : ""}`}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={variant === "dialog" ? styles.dialog : styles.sheet}
        role={variant === "dialog" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {variant === "sheet" && <div className={styles.grabber} aria-hidden="true" />}
        <div className={`${styles.head} ${hideTitle ? styles.headCompact : ""}`}>
          <h2 id={titleId} className={hideTitle ? "sr-only" : styles.title}>
            {title}
          </h2>
          {variant === "sheet" && (
            <button type="button" className={`icon-btn ${styles.close}`} onClick={onClose} aria-label="Zapri">
              <Icon name="close" size={22} />
            </button>
          )}
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    target,
  );
}
