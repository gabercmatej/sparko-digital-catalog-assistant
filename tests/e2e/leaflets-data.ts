/** Home leaflets (the six current catalogs) derived from src/data/catalog.json, in Home order. */
import { readFileSync } from "node:fs";

export type LeafletRec = { id: string; category: string; title: string; pageCount: number; homeOrder: number; validFrom: string; validTo: string };

type CatalogJson = { id: string; retailer: string; title: string; pageCount: number; homeOrder: number | null; validFrom: string; validTo: string };

const raw = JSON.parse(readFileSync("src/data/catalog.json", "utf8")) as { catalogs: CatalogJson[] };

export const leaflets: LeafletRec[] = raw.catalogs
  .map((c) => ({ id: c.id, category: c.retailer, title: c.title, pageCount: c.pageCount, homeOrder: c.homeOrder ?? 0, validFrom: c.validFrom, validTo: c.validTo }))
  .sort((a, b) => a.homeOrder - b.homeOrder);
export const LEAFLET_IDS = ["spar-4426", "interspar-1526", "spar-online-4426", "despar-koper-1626", "mega-spar-0826", "spar-4326"];
export const CATEGORIES = ["spar", "interspar", "spar-online", "despar", "spar", "spar"];
export const cardHref = (id: string) => (id === LEAFLET_IDS[0] ? "/letak" : `/letak?katalog=${id}`);
