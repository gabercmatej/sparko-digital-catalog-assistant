"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store/store";
import { Icon, type IconName } from "../ui/Icon";
import styles from "./BottomNav.module.css";

const ITEMS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/domov", label: "Domov", icon: "home", match: (p) => p.startsWith("/domov") },
  { href: "/", label: "Sparko", icon: "chat", match: (p) => p === "/" },
  { href: "/moj-katalog", label: "Moj katalog", icon: "list", match: (p) => p.startsWith("/moj-katalog") || p.startsWith("/letak") },
];

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  const { saved, hydrated } = useStore();
  return (
    <nav className={styles.nav} aria-label="Glavna navigacija">
      {ITEMS.map((it) => {
        const active = it.match(pathname);
        const count = it.href === "/moj-katalog" && hydrated ? saved.length : 0;
        return (
          <Link key={it.href} href={it.href} className={styles.item} aria-current={active ? "page" : undefined} data-active={active || undefined}>
            <span className={styles.iconWrap}>
              <Icon name={it.icon} size={24} strokeWidth={active ? 2.1 : 1.7} />
              {count > 0 && (
                <span className={styles.badge} aria-label={`${count} izdelkov`}>
                  {count}
                </span>
              )}
            </span>
            <span className={styles.label}>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
