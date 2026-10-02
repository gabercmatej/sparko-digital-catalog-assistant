"use client";
import { useSyncExternalStore } from "react";
import { showToast } from "@/lib/store/store";
import { Icon } from "../ui/Icon";

const noSubscribe = () => () => {};
const subscribe = (cb: () => void) => {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
};
const supported = () => document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === "function";

/** Optional demo helper: explicit-click fullscreen via the Fullscreen API. Hidden where unsupported (e.g. iPhone Safari). */
export function FullscreenToggle({ className, onDone }: { className?: string; onDone?: () => void }) {
  const ok = useSyncExternalStore(noSubscribe, supported, () => false);
  const active = useSyncExternalStore(subscribe, () => document.fullscreenElement != null, () => false);
  if (!ok) return null;
  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      onDone?.();
    } catch {
      showToast("Celozaslonski način v tem brskalniku ni na voljo.");
    }
  };
  return (
    <button type="button" className={className} onClick={toggle} aria-pressed={active}>
      <Icon name={active ? "minimize" : "maximize"} size={21} />
      <span>{active ? "Izhod iz celozaslonskega načina" : "Celozaslonski način"}</span>
    </button>
  );
}
