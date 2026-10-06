/**
 * Mocked "nearest SPAR" data for the demo. No geolocation or store-locator API is called:
 * the user location, store list and distances below are fixed. The shape mirrors what a real
 * store-locator response would provide (id, name, address, coordinates, distance), so this module
 * can later be swapped for an API-backed implementation without touching the UI.
 *
 * `x` / `y` place each store on the symbolic map drawn by NearestStoreCard (0..1, origin top-left).
 * A real implementation would derive them by projecting `lat` / `lng` into the map viewport.
 *
 * Keep this file free of React imports — it may be imported server-side.
 */

export type DemoStore = {
  id: string;
  name: string;
  address: string;
  city: string;
  /** Distance from the (mocked) user location, in metres. */
  distanceM: number;
  lat: number;
  lng: number;
  /** Position on the symbolic map, 0..1 of map width. */
  x: number;
  /** Position on the symbolic map, 0..1 of map height. */
  y: number;
};

export type DemoUserLocation = {
  x: number;
  y: number;
  label: string;
};

/** Mocked user position on the symbolic map. */
export const DEMO_USER_LOCATION: DemoUserLocation = { x: 0.535, y: 0.653, label: "Tvoja lokacija" };

export const NEAREST_STORE_ID = "spar-letaliska-26";

/** Mocked store list (approximate Ljubljana coordinates). */
export const DEMO_STORES: readonly DemoStore[] = [
  {
    id: NEAREST_STORE_ID,
    name: "SPAR Letališka cesta 26",
    address: "Letališka cesta 26",
    city: "1000 Ljubljana",
    distanceM: 15,
    lat: 46.0652,
    lng: 14.5531,
    x: 0.585,
    y: 0.567,
  },
  {
    id: "spar-zaloska",
    name: "SPAR Zaloška",
    address: "Zaloška cesta 69",
    city: "1000 Ljubljana",
    distanceM: 1300,
    lat: 46.0534,
    lng: 14.5482,
    x: 0.825,
    y: 0.893,
  },
  {
    id: "spar-smartinska",
    name: "SPAR Šmartinska",
    address: "Šmartinska cesta 130",
    city: "1000 Ljubljana",
    distanceM: 1600,
    lat: 46.0611,
    lng: 14.5319,
    x: 0.88,
    y: 0.5,
  },
  {
    id: "interspar-citypark",
    name: "INTERSPAR Citypark",
    address: "Šmartinska cesta 152g",
    city: "1000 Ljubljana",
    distanceM: 2100,
    lat: 46.0679,
    lng: 14.5427,
    x: 0.92,
    y: 0.2,
  },
  {
    id: "spar-dunajska",
    name: "SPAR Dunajska",
    address: "Dunajska cesta 129",
    city: "1000 Ljubljana",
    distanceM: 3400,
    lat: 46.0749,
    lng: 14.5122,
    x: 0.262,
    y: 0.17,
  },
  {
    id: "interspar-vic",
    name: "INTERSPAR Vič",
    address: "Jamova cesta 105",
    city: "1000 Ljubljana",
    distanceM: 4800,
    lat: 46.0396,
    lng: 14.4878,
    x: 0.075,
    y: 0.94,
  },
];

export const NEAREST_STORE_TEXT =
  "Najbližji SPAR je na lokaciji Letališka cesta 26, Ljubljana, kar je približno 15 m stran od tebe. Na zemljevidu vidiš svojo lokacijo, najbližji SPAR in ostale SPAR trgovine.";

/** All stores, nearest first. */
export function getStoresByDistance(): DemoStore[] {
  return [...DEMO_STORES].sort((a, b) => a.distanceM - b.distanceM);
}

export function getNearestStore(): DemoStore {
  return DEMO_STORES.find((s) => s.id === NEAREST_STORE_ID) ?? getStoresByDistance()[0];
}

/** "15 m", "850 m", "1,2 km" (Slovenian decimal comma). */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  const text = km >= 10 ? String(Math.round(km)) : km.toFixed(1).replace(".", ",");
  return `${text} km`;
}

/** Google Maps directions link (opens the app on mobile, the website on desktop). */
export function getDirectionsUrl(store: DemoStore): string {
  const destination = `SPAR, ${store.address}, ${store.city}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export const NEAREST_STORE_DIRECTIONS_URL = getDirectionsUrl(getNearestStore());
