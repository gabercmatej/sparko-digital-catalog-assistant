import styles from "./LoginView.module.css";

// Decorative, non-interactive motifs: soft blobs, outline cart, tag and leaves.
export function LoginBackground() {
  return (
    <div className={styles.bg} aria-hidden="true">
      <svg className={styles.blobLeft} viewBox="0 0 400 400" focusable="false">
        <path
          d="M60 40c80-50 210-20 260 60s10 190-80 250-200 60-250-20S-20 90 60 40Z"
          fill="#1a7a4a"
          opacity="0.28"
        />
      </svg>
      <svg className={styles.blobRight} viewBox="0 0 400 400" focusable="false">
        <path
          d="M300 30c70 40 110 140 70 230s-150 140-240 110S-10 220 50 140 230-10 300 30Z"
          fill="#1a7a4a"
          opacity="0.26"
        />
      </svg>
      <svg
        className={styles.cart}
        viewBox="0 0 64 64"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d="M4 8h9l7 32h30l6-22H16" />
        <circle cx="25" cy="52" r="4" />
        <circle cx="46" cy="52" r="4" />
        <path d="M22 28h32" />
      </svg>
      <svg
        className={styles.tag}
        viewBox="0 0 64 64"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d="M6 32 32 6h24v24L30 58 6 32Z" />
        <circle cx="45" cy="19" r="3.5" />
        <path d="M24 40 38 26" />
        <circle cx="25" cy="29" r="2.5" />
        <circle cx="37" cy="41" r="2.5" />
      </svg>
      <svg
        className={styles.leafLeft}
        viewBox="0 0 64 64"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d="M8 56C8 28 28 8 56 8c0 28-20 48-48 48Z" />
        <path d="M8 56 40 24" />
      </svg>
      <svg
        className={styles.leafRight}
        viewBox="0 0 64 64"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d="M56 56C56 28 36 8 8 8c0 28 20 48 48 48Z" />
        <path d="M56 56 24 24" />
      </svg>
    </div>
  );
}
