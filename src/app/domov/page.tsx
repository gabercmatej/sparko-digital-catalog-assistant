import type { Metadata } from "next";
import { HomeView } from "@/components/home/HomeView";

export const metadata: Metadata = { title: "Domov · Sparko" };

/** Home: catalog covers / item list, SPARko actions and the product rail (all client-driven). */
export default function HomePage() {
  return <HomeView />;
}
