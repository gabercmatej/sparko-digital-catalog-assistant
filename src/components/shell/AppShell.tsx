"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hydrate } from "@/lib/store/store";
import { Sidebar } from "../sidebar/Sidebar";
import { BottomNav } from "./BottomNav";
import { Header } from "./Header";
import { Toasts } from "./Toasts";
import { StorageWarning } from "./StorageWarning";
import styles from "./AppShell.module.css";

type ShellCtx = {
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  /** True while the on-screen keyboard is likely open (visual viewport shrunk). */
  keyboardOpen: boolean;
};

const Ctx = createContext<ShellCtx>({ sidebarOpen: false, openSidebar: () => {}, closeSidebar: () => {}, keyboardOpen: false });
export const useShell = () => useContext(Ctx);

/**
 * Persistent mobile shell: header (menu · SPAR logo · new chat), page area, bottom nav.
 * Lives in the root layout so state survives navigation between Domov / Sparko / Moj katalog / letak.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, []);

  // Track the visual viewport so the composer stays above the keyboard and the nav hides.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--app-h", `${Math.round(vv.height)}px`);
      const kb = window.innerHeight - vv.height > 140 && document.activeElement instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      setKeyboardOpen(kb);
      // iOS scrolls the layout viewport when focusing inputs; keep the shell pinned.
      if (vv.offsetTop > 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
    };
  }, []);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const value = useMemo(() => ({ sidebarOpen, openSidebar, closeSidebar, keyboardOpen }), [sidebarOpen, openSidebar, closeSidebar, keyboardOpen]);

  return (
    <Ctx.Provider value={value}>
      <div className={styles.shell} data-keyboard={keyboardOpen || undefined}>
        <Header />
        <StorageWarning />
        <main className={styles.main} id="main">
          {children}
        </main>
        {!keyboardOpen && <BottomNav />}
        <Toasts />
        <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      </div>
    </Ctx.Provider>
  );
}
