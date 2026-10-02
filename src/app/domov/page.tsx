import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Domov · Sparko" };

/** Restrained placeholder. The client designs the real home page later. */
export default function HomePlaceholder() {
  return (
    <div className="page-scroll page-pad" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, textAlign: "center" }}>
      <p style={{ fontSize: "var(--text-md)", color: "var(--c-ink-2)" }}>Demo domača stran je v pripravi.</p>
      <Link href="/" className="btn btn-primary">
        Nazaj k Sparku
      </Link>
    </div>
  );
}
