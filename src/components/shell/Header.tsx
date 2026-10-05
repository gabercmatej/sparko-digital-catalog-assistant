"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startNewChat } from "@/lib/store/store";
import { Icon } from "../ui/Icon";
import { useShell } from "./AppShell";
import styles from "./Header.module.css";

export function Header() {
  const { openSidebar } = useShell();
  const router = useRouter();
  return (
    <header className={styles.header}>
      <button type="button" className="icon-btn" onClick={openSidebar} aria-label="Odpri meni">
        <Icon name="menu" size={24} />
      </button>
      <Link href="/" className={styles.logoLink} aria-label="Sparko">
        {/* Official SPARko mascot, derived from sparko_logo.png (trimmed, transparent background). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/sparko-logo-128.webp"
          srcSet="/brand/sparko-logo-128.webp 1x, /brand/sparko-logo-256.webp 2x"
          alt=""
          className={styles.mark}
          width={40}
          height={40}
        />
        <span className={styles.wordmark} aria-hidden="true">
          Sparko
        </span>
      </Link>
      <button
        type="button"
        className="icon-btn"
        aria-label="Nov pogovor"
        onClick={() => {
          startNewChat();
          router.push("/");
        }}
      >
        <Icon name="new-chat" size={24} />
      </button>
    </header>
  );
}
