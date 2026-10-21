"use client";
import styles from "./ChatEntryButton.module.css";

/** Small round entry to the full Sparko chat, shown beside the Home mascot. */
export function ChatEntryButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={styles.btn} onClick={onClick} disabled={disabled} aria-label="Odpri klepet s Sparkom" data-chat-entry>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4V5a1 1 0 0 1 1-1z" />
        <path d="M9 10h6M12.5 7.5 15 10l-2.5 2.5" />
      </svg>
    </button>
  );
}
