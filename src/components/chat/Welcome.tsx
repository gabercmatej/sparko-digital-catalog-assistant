"use client";
import { useState } from "react";
import { DEMO_LABEL } from "@/lib/catalog";
import { Icon, type IconName } from "../ui/Icon";
import styles from "./Welcome.module.css";

export const SUGGESTIONS: { icon: IconName; text: string }[] = [
  { icon: "search", text: "Koliko stane skuta?" },
  { icon: "percent", text: "Kaj je najbolj znižano?" },
  { icon: "cutlery", text: "Večerja za dva do 10 €" },
  { icon: "bulb", text: "Predlagaj hiter zajtrk" },
];

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
        <p className={styles.subtitle}>Kaj dobrega poiščeva danes?</p>
      </div>
      <ul className={styles.suggestions} aria-label="Predlogi vprašanj">
        {SUGGESTIONS.map((s) => (
          <li key={s.text}>
            <button type="button" className={styles.suggestion} onClick={() => onSuggestion(s.text)} disabled={disabled}>
              <Icon name={s.icon} size={20} className={styles.sIcon} />
              <span className={styles.sText}>{s.text}</span>
              <Icon name="chevron-right" size={18} className={styles.sChevron} />
            </button>
          </li>
        ))}
      </ul>
      <p className={`demo-label ${styles.demo}`}>{DEMO_LABEL}</p>
    </section>
  );
}
