import type { Metadata } from "next";
import { CollectionView } from "@/components/collection/CollectionView";

export const metadata: Metadata = { title: "Moj katalog · Sparko" };

export default function CollectionPage() {
  return <CollectionView />;
}
