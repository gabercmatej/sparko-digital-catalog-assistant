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

  // Track the visual viewport: detect the on-screen keyboard (iOS overlays it; Android with
  // interactive-widget=resizes-content shrinks innerHeight too, so compare against the tallest
  // unzoomed height seen at this width). Only while the iOS keyboard is open does the shell get an
  // explicit height; otherwise CSS (position: fixed; inset: 0) sizes it to the visible area.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let baseline = 0;
    let baseWidth = window.innerWidth;
    let raf = 0;
    const isTyping = () => {
      const a = document.activeElement;
      if (!(a instanceof HTMLElement)) return false;
      if (a.isContentEditable || a.tagName === "TEXTAREA") return true;
      return a instanceof HTMLInputElement && !/^(button|checkbox|radio|range|submit|reset|file|color)$/.test(a.type);
    };
    const apply = () => {
      raf = 0;
      if (window.innerWidth !== baseWidth) {
        baseWidth = window.innerWidth;
        baseline = 0;
      }
      const zoomed = vv.scale > 1.01;
      if (!zoomed) baseline = Math.max(baseline, vv.height);
      const kb = !zoomed && isTyping() && baseline - vv.height > 140;
      setKeyboardOpen(kb);
      if (kb) {
        // iOS pans the layout viewport when focusing inputs; keep the shell pinned.
        if (vv.offsetTop > 0) window.scrollTo(0, 0);
        root.style.setProperty("--app-h", `${Math.floor(vv.height)}px`);
        root.style.setProperty("--app-top", `${Math.max(0, Math.round(vv.offsetTop))}px`);
      } else {
        root.style.removeProperty("--app-h");
        root.style.removeProperty("--app-top");
      }
    };
    const update = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const resetBaseline = () => {
      baseline = 0;
      update();
    };
    apply();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    document.addEventListener("fullscreenchange", resetBaseline);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
      document.removeEventListener("fullscreenchange", resetBaseline);
      root.style.removeProperty("--app-h");
      root.style.removeProperty("--app-top");
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
