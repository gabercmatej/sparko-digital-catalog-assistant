"use client";
import { useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  DEMO_STORES,
  DEMO_USER_LOCATION,
  NEAREST_STORE_DIRECTIONS_URL,
  formatDistance,
  getNearestStore,
  getStoresByDistance,
  type DemoStore,
} from "@/lib/demo/stores";
import styles from "./NearestStoreCard.module.css";

/*
 * "Nearest SPAR" result card shown under Sparko's reply. Everything here is mocked: the map is a
 * hand-drawn inline SVG (no tiles, no network) and the store data comes from lib/demo/stores.
 * Store pins and the user dot are positioned from the 0..1 map coordinates in that module, so a
 * real store-locator only has to supply the same shape.
 */

const VB_W = 400;
const VB_H = 300;
/** Pin height (viewBox units) at scale 1; pins are drawn at PIN_SCALE, the selected one at SELECTED_SCALE. */
const PIN_H = 30;
const SELECTED_SCALE = 1.55;
const PIN_SCALE = 1.15;

const PIN_PATH = "M0 0C-1.6-5.4-9-10.2-9-18.5a9 9 0 1 1 18 0C9-10.2 1.6-5.4 0 0z";
/** Simple fir-tree glyph (not the SPAR logo), centred in the pin head. */
const TREE_PATH = "M0-24.2-3.9-18.4h1.9L-4.7-14.1h9.4L2-18.4h1.9z";

const ROADS = {
  dunajska: "M95 -10C112 80 150 160 168 310",
  smartinska: "M-10 118C100 112 250 98 410 78",
  letaliska: "M150 192C230 178 320 160 410 136",
  zaloska: "M160 232C240 238 320 258 410 292",
  topniska: "M-10 222C40 219 100 225 160 232",
};

const MINOR_ROADS = [
  "M40 -10L60 116",
  "M182 -10C186 40 190 80 196 110",
  "M270 -10L282 100",
  "M290 98L300 165",
  "M190 187L198 236",
  "M378 136L392 310",
  "M270 248L262 310",
  "M118 228L106 310",
  "M-10 40C30 38 70 34 100 30",
  "M330 300C336 280 350 274 360 278",
  "M60 116L52 132",
  "M220 104C230 150 236 180 238 188",
];

const BUILDINGS: [number, number, number, number][] = [
  [8, 6, 22, 14], [8, 52, 26, 18], [66, 46, 20, 22], [116, 8, 24, 16], [118, 40, 26, 22],
  [204, 8, 30, 18], [240, 52, 28, 22], [296, 10, 34, 20], [340, 20, 28, 26], [300, 50, 22, 18],
  [380, 96, 18, 22], [312, 112, 22, 18], [248, 126, 30, 20], [170, 128, 22, 26],
  [112, 146, 14, 30], [304, 176, 30, 14], [356, 166, 16, 24], [210, 244, 22, 22],
  [130, 240, 18, 16], [286, 268, 26, 20], [350, 222, 22, 18], [16, 200, 22, 12], [60, 196, 30, 14],
  [182, 272, 22, 26], [60, 280, 26, 18],
];

function px(v: number, total: number) {
  return v * total;
}

function StorePin({ store, selected }: { store: DemoStore; selected: boolean }) {
  const s = selected ? SELECTED_SCALE : PIN_SCALE;
  return (
    <g transform={`translate(${px(store.x, VB_W)} ${px(store.y, VB_H)})`}>
      <title>{store.name}</title>
      <ellipse cx="0" cy="0.5" rx={4.2 * s} ry={1.6 * s} fill="rgb(0 0 0 / 22%)" />
      <g transform={`scale(${s})`}>
        <path d={PIN_PATH} fill="#e30613" stroke={selected ? "#fff" : "#b8000f"} strokeWidth={selected ? 1.4 : 0.8} />
        <circle cx="0" cy="-18.5" r="6.4" fill="#fff" />
        <path d={TREE_PATH} fill="#0d6b3b" />
        <rect x="-0.9" y="-14.2" width="1.8" height="2.2" fill="#0d6b3b" />
      </g>
    </g>
  );
}

function SymbolicMap({ uid, nearest }: { uid: string; nearest: DemoStore }) {
  const user = DEMO_USER_LOCATION;
  const ux = px(user.x, VB_W);
  const uy = px(user.y, VB_H);
  const others = DEMO_STORES.filter((s) => s.id !== nearest.id);
  const id = (name: string) => `${uid}-${name}`;

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`Zemljevid: tvoja lokacija in najbližji ${nearest.name} ter ostale SPAR trgovine v okolici`}
      focusable="false"
    >
      <defs>
        {Object.entries(ROADS).map(([name, d]) => (
          <path key={name} id={id(name)} d={d} />
        ))}
        <path id={id("river")} d="M-10 248C50 232 95 272 150 266C195 261 215 282 236 310" />
        <filter id={id("shadow")} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* land */}
      <rect width={VB_W} height={VB_H} fill="#f2f3f1" />

      {/* building footprints */}
      <g fill="#e8e9e5">
        {BUILDINGS.map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx="1.5" />
        ))}
      </g>

      {/* parks */}
      <g fill="#cdeccb">
        <path d="M-5 134C30 127 70 129 90 137C97 158 90 180 72 188C42 195 12 194-5 190z" />
        <rect x="256" y="190" width="42" height="30" rx="4" />
        <path d="M318 -5h60c4 14 0 24-12 28-16 4-36 2-46-6-6-6-6-14-2-22z" />
      </g>

      {/* river */}
      <use href={`#${id("river")}`} fill="none" stroke="#aadaff" strokeWidth="11" strokeLinecap="round" />

      {/* road casings */}
      <g fill="none" stroke="#dadcd8" strokeLinecap="round" strokeLinejoin="round">
        {MINOR_ROADS.map((d, i) => (
          <path key={i} d={d} strokeWidth="5.4" />
        ))}
        <use href={`#${id("topniska")}`} strokeWidth="7" />
        <use href={`#${id("zaloska")}`} strokeWidth="9.5" />
        <use href={`#${id("letaliska")}`} strokeWidth="10.5" />
        <use href={`#${id("smartinska")}`} strokeWidth="12" />
        <use href={`#${id("dunajska")}`} strokeWidth="12" />
      </g>
      {/* road fills */}
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        {MINOR_ROADS.map((d, i) => (
          <path key={i} d={d} strokeWidth="3.6" />
        ))}
        <use href={`#${id("topniska")}`} strokeWidth="5" />
        <use href={`#${id("zaloska")}`} strokeWidth="7.5" />
        <use href={`#${id("letaliska")}`} strokeWidth="8.5" />
        <use href={`#${id("smartinska")}`} strokeWidth="10" />
        <use href={`#${id("dunajska")}`} strokeWidth="10" />
      </g>

      {/* labels */}
      <g className={styles.street}>
        <text dy="3.4">
          <textPath href={`#${id("letaliska")}`} startOffset="42%">Letališka cesta</textPath>
        </text>
        <text dy="3.4">
          <textPath href={`#${id("dunajska")}`} startOffset="54%">Dunajska cesta</textPath>
        </text>
        <text dy="3.4">
          <textPath href={`#${id("zaloska")}`} startOffset="36%">Zaloška cesta</textPath>
        </text>
        <text dy="3.4">
          <textPath href={`#${id("topniska")}`} startOffset="6%">Topniška ulica</textPath>
        </text>
        <text dy="3.4">
          <textPath href={`#${id("smartinska")}`} startOffset="2%">Šmartinska cesta</textPath>
        </text>
      </g>
      <text className={styles.water} dy="-8">
        <textPath href={`#${id("river")}`} startOffset="10%">Ljubljanica</textPath>
      </text>
      <text className={styles.park} x="42" y="166" textAnchor="middle">
        Park Tivoli
      </text>
      <text className={styles.city} x="346" y="216" textAnchor="middle">
        Ljubljana
      </text>

      {/* other stores */}
      {others.map((s) => (
        <StorePin key={s.id} store={s} selected={false} />
      ))}

      {/* user location */}
      <circle cx={ux} cy={uy} r="20" fill="#1a73e8" fillOpacity="0.14" />
      <circle className={styles.pulse} cx={ux} cy={uy} r="20" fill="#1a73e8" />
      <circle cx={ux} cy={uy} r="7.5" fill="#1a73e8" stroke="#fff" strokeWidth="2.8" filter={`url(#${id("shadow")})`} />

      {/* selected (nearest) store */}
      <StorePin store={nearest} selected />
    </svg>
  );
}

function NavigationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.5 4.6 20.2l.8.8L12 18.1l6.6 2.9.8-.8z" fill="currentColor" />
    </svg>
  );
}

function SparGlyph({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <svg width="16" height="16" viewBox="-6 -25 12 13" focusable="false">
        <path d={TREE_PATH} fill="currentColor" />
        <rect x="-0.9" y="-14.2" width="1.8" height="2.2" fill="currentColor" />
      </svg>
    </span>
  );
}

export function NearestStoreCard() {
  const rawId = useId();
  const uid = `nsc${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const nearest = getNearestStore();
  const stores = getStoresByDistance();
  const user = DEMO_USER_LOCATION;
  const calloutTop = ((nearest.y * VB_H - PIN_H * SELECTED_SCALE - 5) / VB_H) * 100;

  return (
    <section className={styles.card} data-testid="nearest-store-card" aria-label={`Najbližji SPAR: ${nearest.name}`}>
      <div className={styles.map}>
        <SymbolicMap uid={uid} nearest={nearest} />
        <div
          className={styles.userLabel}
          style={{ left: `${user.x * 100}%`, top: `${user.y * 100}%` }}
          aria-hidden="true"
        >
          {user.label}
        </div>
        <div className={styles.callout} style={{ left: `${nearest.x * 100}%`, top: `${calloutTop}%` }} aria-hidden="true">
          <SparGlyph className={styles.calloutIcon} />
          <span className={styles.calloutText}>
            <strong>{nearest.name}</strong>
            <span>{formatDistance(nearest.distanceM)}</span>
          </span>
          <Icon name="chevron-right" size={16} strokeWidth={2} className={styles.calloutChevron} />
        </div>
      </div>

      <div className={styles.actions}>
        <a
          className={`btn btn-primary ${styles.action}`}
          href={NEAREST_STORE_DIRECTIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="nearest-store-nav"
        >
          <NavigationIcon />
          <span>Odpri navigacijo</span>
        </a>
        <button
          type="button"
          className={`btn ${styles.action} ${styles.secondary}`}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          data-testid="nearest-store-all"
        >
          <Icon name="list" size={18} strokeWidth={2} />
          <span>Poglej vse SPAR trgovine</span>
        </button>
      </div>

      <ul id={listId} className={styles.list} hidden={!open} aria-label="SPAR trgovine v bližini">
        {stores.map((s) => {
          const isNearest = s.id === nearest.id;
          return (
            <li key={s.id} className={`${styles.item} ${isNearest ? styles.itemNearest : ""}`}>
              <SparGlyph className={styles.itemIcon} />
              <span className={styles.itemText}>
                <span className={styles.itemName}>
                  {s.name}
                  {isNearest && <span className={styles.badge}>Najbližja</span>}
                </span>
                <span className={styles.itemAddr}>
                  {s.address}, {s.city}
                </span>
              </span>
              <span className={styles.itemDist}>{formatDistance(s.distanceM)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
