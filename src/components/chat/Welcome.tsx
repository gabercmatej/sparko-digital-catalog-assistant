"use client";
import { useState } from "react";
import { STARTER_PROMPTS } from "@/lib/assistant/starters";
import { Icon, type IconName } from "../ui/Icon";
import styles from "./Welcome.module.css";

const STARTER_ICONS: IconName[] = ["search", "percent", "pin", "store"];

/** Four compact, generic starters in a 2×2 grid (no hard-coded product). */
export const SUGGESTIONS: { icon: IconName; text: string }[] = STARTER_PROMPTS.map((s, i) => ({ icon: STARTER_ICONS[i], text: s.message }));

export function Welcome({ onSuggestion, disabled }: { onSuggestion: (text: string) => void; disabled?: boolean }) {
  const [mascotOk, setMascotOk] = useState(true);
  return (
    <section className={styles.welcome} aria-labelledby="welcome-title">
      <div className={styles.hero}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/sparko-mascot.webp"
          alt="Sparko, nakupovalna košarica s telefonom"
          width={110}
          height={110}
          className={styles.mascot}
          style={mascotOk ? undefined : { visibility: "hidden" }}
          onError={() => setMascotOk(false)}
          decoding="async"
        />
        <h1 id="welcome-title" className={styles.title}>
          Tvoj pomočnik Sparko
        </h1>
        <p className={styles.subtitle}>Pomagam ti z izdelki, cenami, idejami in recepti.</p>
      </div>
      <ul className={styles.suggestions} aria-label="Predlogi vprašanj">
        {SUGGESTIONS.map((s) => (
          <li key={s.text}>
            <button type="button" className={styles.suggestion} onClick={() => onSuggestion(s.text)} disabled={disabled}>
              <span className={styles.sIconWrap}>
                <Icon name={s.icon} size={17} strokeWidth={2} className={styles.sIcon} />
              </span>
              <span className={styles.sText}>{s.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
