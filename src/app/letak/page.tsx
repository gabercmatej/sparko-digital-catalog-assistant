import { Suspense } from "react";
import { LeafletView } from "@/components/leaflet/LeafletView";

export const metadata = {
  title: "SPAR letak · Sparko",
};

/** /letak?stran=<pdfPageNumber>&izdelek=<productId>&moji=1 — interactive original SPAR leaflet. */
export default function LeafletPage() {
  return (
    <Suspense fallback={<div className="page-scroll page-pad" aria-busy="true" />}>
      <LeafletView />
    </Suspense>
  );
}
