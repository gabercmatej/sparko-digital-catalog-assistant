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
      <Link href="/" className={styles.logoLink} aria-label="SPAR – Sparko">
        {/* Official SPAR logo extracted as vector from the source catalog PDF. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/spar-logo.svg" alt="SPAR" className={styles.logo} width={112} height={22} />
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
