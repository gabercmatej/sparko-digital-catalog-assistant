/** Home leaflets (browse-only) derived from src/data/leaflets.json, in Home order. */
import { readFileSync } from "node:fs";

export type LeafletRec = { id: string; category: string; title: string; pageCount: number; homeOrder: number; validFrom: string; validTo: string };

const raw = JSON.parse(readFileSync("src/data/leaflets.json", "utf8")) as { leaflets: LeafletRec[] };

export const leaflets: LeafletRec[] = [...raw.leaflets].sort((a, b) => a.homeOrder - b.homeOrder);
export const LEAFLET_IDS = ["spar-4426", "interspar-1526", "spar-online-4426", "despar-koper-1626", "mega-spar-0826", "spar-4326"];
export const CATEGORIES = ["spar", "interspar", "spar-online", "despar", "spar", "spar"];
export const cardHref = (id: string) => (id === LEAFLET_IDS[0] ? "/letak" : `/letak?katalog=${id}`);
