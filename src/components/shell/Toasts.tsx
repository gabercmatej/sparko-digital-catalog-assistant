"use client";
import { dismissToast, useStore } from "@/lib/store/store";
import { Icon } from "../ui/Icon";
import styles from "./Toasts.module.css";

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={styles.toast}>
          <span className={styles.text}>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className={styles.close} onClick={() => dismissToast(t.id)} aria-label="Zapri obvestilo">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
