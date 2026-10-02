"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { relativeDate } from "@/lib/chat/messages";
import { DEMO_CONVERSATIONS } from "@/lib/demo-conversations";
import { setActiveConversation, startNewChat, useStore } from "@/lib/store/store";
import { Icon } from "../ui/Icon";
import { SettingsPanel } from "./SettingsPanel";
import styles from "./Sidebar.module.css";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Slide-in navigation panel: new chat, Moj katalog, SPAR letak, history, examples, settings. */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [view, setView] = useState<"menu" | "settings">("menu");

  // Reset to the menu view whenever the panel closes (state adjusted during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setView("menu");
  }

  // Close on route change.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      if (open) onClose();
    }
  }, [pathname, open, onClose]);

  // Focus management: focus first item on open, restore focus on close.
  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement as HTMLElement | null;
      const t = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(), 30);
      return () => window.clearTimeout(t);
    }
    if (restoreRef.current) {
      restoreRef.current.focus?.();
      restoreRef.current = null;
    }
  }, [open]);

  // Move focus into the panel when switching views.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [view, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (view === "settings") setView("menu");
      else onClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const goChat = (id: string | null) => {
    if (id) setActiveConversation(id);
    else startNewChat();
    onClose();
    if (pathname !== "/") router.push("/");
  };

  const userConversations = store.conversations.filter((c) => c.kind === "user" && c.messages.length > 0).sort((a, b) => b.updatedAt - a.updatedAt);
  const active = store.activeConversationId;

  return (
    <div className={styles.root} data-open={open || undefined} aria-hidden={!open} inert={!open}>
      <div className={styles.scrim} onClick={onClose} />
      <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-label="Meni" onKeyDown={onKeyDown}>
        {view === "settings" ? (
          <SettingsPanel onBack={() => setView("menu")} />
        ) : (
          <>
            <div className={styles.top}>
              <span className={styles.brand}>Sparko</span>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Zapri meni">
                <Icon name="close" size={22} />
              </button>
            </div>
            <div className={styles.scroll}>
              <nav className={styles.mainNav} aria-label="Glavni meni">
                <button type="button" className={styles.navItem} onClick={() => goChat(null)} data-autofocus>
                  <Icon name="new-chat" size={21} />
                  <span>Nov pogovor</span>
                </button>
                <Link href="/moj-katalog" className={styles.navItem} onClick={onClose}>
                  <Icon name="list" size={21} />
                  <span>Moj katalog</span>
                  <span className={styles.count} aria-label={`${store.saved.length} izdelkov`}>
                    {store.saved.length}
                  </span>
                </Link>
                <Link href="/letak" className={styles.navItem} onClick={onClose}>
                  <Icon name="leaflet" size={21} />
                  <span>SPAR letak</span>
                </Link>
              </nav>

              <section className={styles.section} aria-labelledby="sb-history">
                <h2 id="sb-history" className={styles.sectionTitle}>
                  Tvoji pogovori
                </h2>
                {!store.hydrated ? null : userConversations.length === 0 ? (
                  <p className={styles.empty}>Tu se bodo shranili tvoji pogovori. Začni z vprašanjem Sparku.</p>
                ) : (
                  <ul className={styles.list}>
                    {userConversations.map((c) => (
                      <li key={c.id}>
                        <button type="button" className={styles.conv} aria-current={c.id === active ? "true" : undefined} onClick={() => goChat(c.id)}>
                          <span className={styles.convTitle}>{c.title}</span>
                          <span className={styles.convDate}>{relativeDate(c.updatedAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={styles.section} aria-labelledby="sb-demos">
                <h2 id="sb-demos" className={styles.sectionTitle}>
                  Primeri pogovorov
                </h2>
                <ul className={styles.list}>
                  {DEMO_CONVERSATIONS.map((c) => (
                    <li key={c.id}>
                      <button type="button" className={styles.conv} aria-current={c.id === active ? "true" : undefined} onClick={() => goChat(c.id)}>
                        <span className={styles.convTitle}>{c.title}</span>
                        <span className={styles.demoTag}>Primer</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            <div className={styles.bottom}>
              <button type="button" className={styles.navItem} onClick={() => setView("settings")}>
                <Icon name="settings" size={21} />
                <span>Nastavitve</span>
                <Icon name="chevron-right" size={18} className={styles.navChevron} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
