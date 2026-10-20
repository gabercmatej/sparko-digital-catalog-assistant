import { Suspense } from "react";
import { LeafletView } from "@/components/leaflet/LeafletView";

export const metadata = {
  title: "Letak · Sparko",
};

/** /letak?katalog=<catalogId>&stran=<pdfPageNumber>&izdelek=<productId>&moji=1 — interactive original SPAR / INTERSPAR leaflets. */
export default function LeafletPage() {
  return (
    <Suspense fallback={<div className="page-scroll page-pad" aria-busy="true" />}>
      <LeafletView />
    </Suspense>
  );
}
