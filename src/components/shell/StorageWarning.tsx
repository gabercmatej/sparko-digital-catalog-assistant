"use client";
import { useStore } from "@/lib/store/store";

/** Visible warning when changes cannot be persisted on this device. */
export function StorageWarning() {
  const { storageStatus, hydrated } = useStore();
  if (!hydrated || storageStatus === "ok") return null;
  const text =
    storageStatus === "recovered"
      ? "Shranjeni podatki so bili poškodovani, zato je Sparko začel na novo."
      : storageStatus === "quota"
        ? "Prostor za shranjevanje je poln. Nove spremembe ne bodo trajno shranjene."
        : "Brskalnik ne dovoli shranjevanja. Spremembe ne bodo ohranjene po osvežitvi.";
  return (
    <div role="alert" style={{ flex: "none", padding: "8px var(--pad-x)", background: "var(--c-warning-bg)", color: "var(--c-warning-ink)", fontSize: "var(--text-sm)" }}>
      {text}
    </div>
  );
}
