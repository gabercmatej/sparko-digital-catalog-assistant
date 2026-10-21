"use client";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { armChatEntryReveal } from "@/lib/chatEntryFlag";

/** Exit animation length; keep in sync with ChatEntry.module.css. */
export const CHAT_ENTRY_EXIT_MS = 400;
/** Hard ceiling: exiting state can never outlive this. */
const SAFETY_MS = 1500;

/**
 * Home -> chat transition. `start()` plays the exit (class `exiting` on the Home root), then pushes "/".
 * Re-entry guarded; reduced motion navigates immediately; always self-resets.
 */
export function useChatEntryTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [startedAt, setStartedAt] = useState<string | null>(null);
  // Derived: a pathname change (leaving Home) ends the exiting state by itself.
  const exiting = startedAt !== null && startedAt === pathname;
  const busy = useRef(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const reset = useCallback(() => {
    clearTimers();
    busy.current = false;
    setStartedAt(null);
  }, []);

  const start = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    router.prefetch("/");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const go = () => {
      armChatEntryReveal();
      router.push("/");
    };
    if (reduced) {
      go();
      timers.current.push(window.setTimeout(reset, SAFETY_MS));
      return;
    }
    setStartedAt(pathname);
    timers.current.push(window.setTimeout(go, CHAT_ENTRY_EXIT_MS));
    timers.current.push(window.setTimeout(reset, SAFETY_MS));
  }, [router, reset, pathname]);

  // Unmount, hidden-then-reshown (cached route) and bfcache restore all land on a normal Home.
  useEffect(() => {
    const onShow = () => reset();
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pageshow", onShow);
      clearTimers();
      busy.current = false;
      setStartedAt(null);
    };
  }, [reset]);

  return { exiting, start };
}
