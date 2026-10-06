"use client";

/**
 * Symbolic indoor store map shown under a Sparko reply ("Kje najdem kruh?").
 * Mocked: the floor plan comes from DEMO_INDOOR_STORE (src/lib/demo/storeMap.ts) and the user's
 * position is fixed near the entrance. Switching to another store only swaps the name — the
 * caption tells the user the plan is symbolic.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DEMO_STORES } from "@/lib/demo/stores";
import { DEMO_INDOOR_STORE, type IndoorStore, type StoreSection, type StoreSectionTone } from "@/lib/demo/storeMap";
import styles from "./StoreMapCard.module.css";

type Tone = { fill: string; stroke: string; strongFill: string; strongStroke: string; ink: string };

const TONES: Record<StoreSectionTone, Tone> = {
  produce: { fill: "#e8f4e5", stroke: "#c4e2bd", strongFill: "#cbeac3", strongStroke: "#3c9a4a", ink: "#2d6a35" },
  dairy: { fill: "#e7f0fb", stroke: "#c3d8f1", strongFill: "#cfe1f8", strongStroke: "#3a7cc3", ink: "#285a8e" },
  bakery: { fill: "#fdf1dc", stroke: "#f2d8a6", strongFill: "#fbe0ab", strongStroke: "#d9891b", ink: "#875012" },
  meat: { fill: "#fbe8e6", stroke: "#f0c6c1", strongFill: "#f8d0ca", strongStroke: "#cf5548", ink: "#8d2f25" },
  neutral: { fill: "#eef0ef", stroke: "#d9dedb", strongFill: "#dfe5e2", strongStroke: "#7e8a84", ink: "#56605b" },
  checkout: { fill: "#f4f6f5", stroke: "#dde2df", strongFill: "#e3ebe6", strongStroke: "#7e8a84", ink: "#56605b" },
};

const WALL = "#9aa09c";
const SHELF_FILL = "#e6e9e7";
const SHELF_STROKE = "#d3d8d5";

/* ---------------------------------------------------------------- 24×24 line icons (map) */

const ICON_PATHS: Record<string, string[]> = {
  apple: [
    "M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.92 4.92 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z",
    "M10 2c1 .5 2 2 2 5",
  ],
  carrot: [
    "M2.27 21.7s9.87-3.5 12.73-6.36a4.5 4.5 0 0 0-6.36-6.37C5.77 11.84 2.27 21.7 2.27 21.7zM8.64 14l-2.05-2.04M15.34 15l-2.46-2.46",
    "M22 9s-1.33-2-3.5-2C16.86 7 15 9 15 9s1.33 2 3.5 2S22 9 22 9z",
    "M15 2s-2 1.33-2 3.5S15 9 15 9s2-1.84 2-3.5C17 3.33 15 2 15 2z",
  ],
  croissant: [
    "m4.6 13.11 5.79-3.21c1.89-1.05 4.79 1.78 3.71 3.71l-3.22 5.81C8.8 23.16.79 15.23 4.6 13.11Z",
    "m10.5 9.5-1-2.29C9.2 6.48 8.8 6 8 6H4.5C2.79 6 2 6.5 2 8.5a7.71 7.71 0 0 0 2 4.83",
    "M8 6c0-1.55.24-4-2-4-2 0-2.5 2.17-2.5 4",
    "m14.5 13.5 2.29 1c.73.3 1.21.7 1.21 1.5v3.5c0 1.71-.5 2.5-2.5 2.5a7.71 7.71 0 0 1-4.83-2",
    "M18 16c1.55 0 4-.24 4 2 0 2-2.17 2.5-4 2.5",
  ],
  milk: [
    "M8 2h8",
    "M9 2v2.79a4 4 0 0 1-.67 2.22l-.66.98A4 4 0 0 0 7 10.21V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.79a4 4 0 0 0-.67-2.22l-.66-.98A4 4 0 0 1 15 4.79V2",
    "M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0",
  ],
  meat: [
    "M16.4 13.7A6.5 6.5 0 1 0 6.28 6.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3",
    "m18.5 6 2.19 4.5a6.48 6.48 0 0 1-2.29 7.2C15.4 20.2 11 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5",
    "M15 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  ],
  cart: [
    "M9 21a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM20 21a1 1 0 1 1-2 0 1 1 0 0 1 2 0z",
    "M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12",
  ],
};

const SECTION_ICONS: Partial<Record<StoreSectionTone, string[]>> = {
  produce: ["apple", "carrot"],
  bakery: ["croissant"],
  dairy: ["milk"],
  meat: ["meat"],
  checkout: ["cart"],
};

/** Draws one or more 24-grid icons side by side, centred on (cx, cy), `size` map units tall. */
function MapIcons({ names, cx, cy, size, color }: { names: string[]; cx: number; cy: number; size: number; color: string }) {
  const s = size / 24;
  const gap = size * 0.15;
  const total = names.length * size + (names.length - 1) * gap;
  const x0 = cx - total / 2;
  return (
    <g fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {names.map((n, i) => (
        <g key={n} transform={`translate(${x0 + i * (size + gap)} ${cy - size / 2}) scale(${s})`}>
          {ICON_PATHS[n].map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- floor plan */

const FONT = 3.9;
const FONT_SMALL = 3.5;
const CHAR_W = 0.56; // average glyph width / font-size for the UI font, used for rough text fitting

function splitLabel(label: string, maxWidth: number, fs: number): string[] {
  if (label.length * fs * CHAR_W <= maxWidth || !label.includes(" ")) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return [label.slice(0, best), label.slice(best + 1)];
}

function SectionShape({ section, target }: { section: StoreSection; target: boolean }) {
  const t = TONES[section.tone];
  const { x, y, w, h } = section;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const icons = SECTION_ICONS[section.tone];
  const neutral = section.tone === "neutral";
  const fs = neutral ? FONT_SMALL : FONT;
  const lineH = fs * 1.18;
  const textProps = {
    fill: t.ink,
    fontSize: fs,
    fontWeight: target ? 700 : 600,
    textAnchor: "middle" as const,
    className: styles.mapText,
  };

  let content: ReactNode;
  if (section.tone === "checkout") {
    // Label + cart on the left, four checkout counters (belt + till) on the right.
    const counters = [0, 1, 2, 3].map((i) => {
      const cxk = x + 19.5 + i * 6.6;
      return (
        <g key={i}>
          <rect x={cxk} y={y + 2} width={4.4} height={6.5} rx={0.8} fill="#fff" stroke={SHELF_STROKE} strokeWidth={0.35} />
          <rect x={cxk + 0.9} y={y + 2.8} width={1.2} height={4.9} rx={0.4} fill="#cfd5d2" />
          <rect x={cxk + 2.6} y={y + 5.6} width={1.2} height={1.6} rx={0.3} fill="#aab2ae" />
        </g>
      );
    });
    content = (
      <>
        <MapIcons names={icons ?? []} cx={x + 9} cy={y + 3.6} size={4.6} color={t.ink} />
        <text {...textProps} fontSize={FONT_SMALL} x={x + 9} y={y + 9.4}>
          {section.label}
        </text>
        {counters}
      </>
    );
  } else if (!icons) {
    const lines = splitLabel(section.label, w - 2, fs);
    content = lines.map((line, i) => (
      <text key={line} {...textProps} x={cx} y={cy + fs * 0.36 + (i - (lines.length - 1) / 2) * lineH}>
        {line}
      </text>
    ));
  } else if (w > h * 2.4) {
    // Wide strip: icon left of the label on one line.
    const iconSize = Math.min(6, h - 4);
    const tw = section.label.length * fs * CHAR_W;
    const gw = iconSize * icons.length + 1.6 + tw;
    const left = cx - gw / 2;
    content = (
      <>
        <MapIcons names={icons} cx={left + (iconSize * icons.length) / 2} cy={cy} size={iconSize} color={t.ink} />
        <text {...textProps} textAnchor="start" x={left + iconSize * icons.length + 1.6} y={cy + fs * 0.36}>
          {section.label}
        </text>
      </>
    );
  } else {
    // Block: icon(s) above a (possibly two-line) label, centred.
    const lines = splitLabel(section.label, w - 2.5, fs);
    const iconSize = 6;
    const gh = iconSize + 1.8 + lines.length * lineH;
    const top = cy - gh / 2;
    content = (
      <>
        <MapIcons names={icons} cx={cx} cy={top + iconSize / 2} size={iconSize} color={t.ink} />
        {lines.map((line, i) => (
          <text key={line} {...textProps} x={cx} y={top + iconSize + 1.8 + fs * 0.82 + i * lineH}>
            {line}
          </text>
        ))}
      </>
    );
  }

  return (
    <g>
      {target && <rect x={x - 1} y={y - 1} width={w + 2} height={h + 2} rx={2.6} fill="none" stroke={t.strongStroke} strokeOpacity={0.22} strokeWidth={1.4} />}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={1.8}
        fill={target ? t.strongFill : t.fill}
        stroke={target ? t.strongStroke : t.stroke}
        strokeWidth={target ? 0.55 : 0.35}
      />
      {content}
    </g>
  );
}

/** Google-Maps style red teardrop pin; (x, y) is the tip. */
function TargetPin({ x, y }: { x: number; y: number }) {
  const s = 0.42;
  return (
    <g className={styles.pin}>
      <ellipse cx={x} cy={y} rx={1.6} ry={0.6} fill="#000" opacity={0.22} />
      <g transform={`translate(${x - 12 * s} ${y - 22 * s}) scale(${s})`}>
        <path d="M12 1.5C7.9 1.5 4.6 4.8 4.6 8.9c0 5.4 7.4 13.1 7.4 13.1s7.4-7.7 7.4-13.1c0-4.1-3.3-7.4-7.4-7.4z" fill="#ea4335" stroke="#b3261e" strokeWidth={1} />
        <circle cx={12} cy={8.9} r={2.8} fill="#7c1710" />
      </g>
    </g>
  );
}

function UserDot({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle className={styles.pulse} cx={x} cy={y} r={4.6} fill="#1a73e8" />
      <circle cx={x} cy={y} r={3.4} fill="#1a73e8" opacity={0.16} />
      <circle cx={x} cy={y + 0.2} r={2.05} fill="#000" opacity={0.15} />
      <circle cx={x} cy={y} r={2} fill="#fff" />
      <circle cx={x} cy={y} r={1.45} fill="#1a73e8" />
    </g>
  );
}

export function StoreFloorPlan({
  store = DEMO_INDOOR_STORE,
  storeName,
  targetId,
  className,
}: {
  store?: IndoorStore;
  storeName?: string;
  targetId?: string;
  className?: string;
}) {
  const target = store.sections.find((s) => s.id === targetId) ?? null;
  const name = storeName ?? store.name;
  const label = target
    ? `Simboličen zemljevid trgovine ${name}: označen je oddelek ${target.label}.`
    : `Simboličen zemljevid trgovine ${name}.`;
  const outline = store.outline.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const { x1, x2, y: ey } = store.entrance;
  const doorW = (x2 - x1) / 2;
  const doorMid = x1 + doorW;

  return (
    <svg viewBox="0 0 100 80" className={className} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {/* floor */}
      <path d={`${outline} Z`} fill="#fbfcfb" />

      {/* generic aisle shelving */}
      {store.shelves.map((s, i) => (
        <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={0.9} fill={SHELF_FILL} stroke={SHELF_STROKE} strokeWidth={0.3} />
      ))}

      {/* departments */}
      {store.sections.map((s) => (
        <SectionShape key={s.id} section={s} target={s.id === target?.id} />
      ))}

      {/* outer walls (open at the entrance) */}
      <path d={outline} fill="none" stroke={WALL} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="square" />
      <path d={outline} fill="none" stroke="#c4c9c6" strokeWidth={0.4} strokeLinejoin="round" strokeLinecap="butt" />

      {/* entrance: two swinging door leaves */}
      <g fill="none" stroke={WALL} strokeWidth={0.4}>
        <path d={`M${x1} ${ey} V${ey - doorW}`} strokeWidth={0.6} />
        <path d={`M${x2} ${ey} V${ey - doorW}`} strokeWidth={0.6} />
        <path d={`M${x1} ${ey - doorW} A${doorW} ${doorW} 0 0 1 ${doorMid} ${ey}`} strokeDasharray="0.8 0.6" />
        <path d={`M${x2} ${ey - doorW} A${doorW} ${doorW} 0 0 0 ${doorMid} ${ey}`} strokeDasharray="0.8 0.6" />
      </g>
      <text x={doorMid} y={ey + 4.6} fontSize={FONT_SMALL} fontWeight={600} fill="#6b6b6b" textAnchor="middle" className={styles.mapText}>
        Vhod
      </text>

      <UserDot x={store.userLocation.x} y={store.userLocation.y} />
      {target && <TargetPin x={target.pin.x} y={target.pin.y} />}
    </svg>
  );
}

/* ---------------------------------------------------------------- HTML icons */

function MapIcon() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M14.1 5.55a2 2 0 0 0 1.8 0l3.65-1.83A1 1 0 0 1 21 4.62v12.76a1 1 0 0 1-.55.9l-4.55 2.27a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.65 1.83A1 1 0 0 1 3 19.38V6.62a1 1 0 0 1 .55-.9L8.1 3.45a2 2 0 0 1 1.8 0zM15 5.76v15M9 3.24v15" />
    </svg>
  );
}

function PinIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0" />
      <circle cx={12} cy={10} r={3} />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

/* ---------------------------------------------------------------- card */

type StoreChoice = { id: string; name: string; address: string };

const STORE_CHOICES: StoreChoice[] = DEMO_STORES.map((s) => ({ id: s.id, name: s.name, address: `${s.address}, Ljubljana` }));

export function StoreMapCard({ sectionId }: { sectionId: string }) {
  const [storeId, setStoreId] = useState(DEMO_INDOOR_STORE.id);
  const [listOpen, setListOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openBtnRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const listId = `${uid}-stores`;
  const dialogTitleId = `${uid}-dialog-title`;

  const storeName = STORE_CHOICES.find((s) => s.id === storeId)?.name ?? DEMO_INDOOR_STORE.name;
  const target = DEMO_INDOOR_STORE.sections.find((s) => s.id === sectionId);
  const others = STORE_CHOICES.filter((s) => s.id !== storeId);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (mapOpen && !d.open) d.showModal();
    else if (!mapOpen && d.open) d.close();
  }, [mapOpen]);

  function chooseStore(id: string) {
    setStoreId(id);
    setListOpen(false);
  }

  return (
    <section className={styles.card} data-testid="store-map-card" data-section={target?.id ?? sectionId} aria-labelledby={titleId}>
      <header className={styles.head}>
        <span className={styles.headIcon} aria-hidden="true">
          <PinIcon size={20} />
        </span>
        <div className={styles.headText}>
          <h3 id={titleId} className={styles.title}>
            Zemljevid trgovine
          </h3>
          <p className={styles.subtitle}>{storeName}</p>
        </div>
      </header>

      <div className={styles.mapFrame}>
        <StoreFloorPlan storeName={storeName} targetId={target?.id} className={styles.map} />
      </div>
      <p className={styles.caption}>Slika je simbolična.</p>

      <div className={styles.actions}>
        <button
          ref={openBtnRef}
          type="button"
          className={`btn btn-primary ${styles.action}`}
          data-testid="store-map-open"
          aria-haspopup="dialog"
          onClick={() => setMapOpen(true)}
        >
          <MapIcon />
          <span>Odpri zemljevid trgovine</span>
        </button>
        <button
          type="button"
          className={`btn ${styles.action} ${styles.secondary}`}
          data-testid="store-map-other"
          aria-expanded={listOpen}
          aria-controls={listId}
          onClick={() => setListOpen((v) => !v)}
        >
          <PinIcon />
          <span>Poglej zemljevid druge trgovine</span>
        </button>
      </div>

      {listOpen && (
        <ul id={listId} className={styles.storeList} aria-label="Druge trgovine SPAR">
          {others.map((s) => (
            <li key={s.id}>
              <button type="button" className={styles.storeItem} onClick={() => chooseStore(s.id)}>
                <span className={styles.storeItemIcon} aria-hidden="true">
                  <PinIcon size={16} />
                </span>
                <span className={styles.storeItemText}>
                  <span className={styles.storeItemName}>{s.name}</span>
                  <span className={styles.storeItemAddr}>{s.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={dialogTitleId}
        onClose={() => {
          setMapOpen(false);
          openBtnRef.current?.focus();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setMapOpen(false);
        }}
      >
        {mapOpen && (
          <div className={styles.dialogBody}>
            <div className={styles.dialogHead}>
              <span className={styles.headIcon} aria-hidden="true">
                <PinIcon size={20} />
              </span>
              <div className={styles.headText}>
                <h2 id={dialogTitleId} className={styles.title}>
                  Zemljevid trgovine
                </h2>
                <p className={styles.subtitle}>{storeName}</p>
              </div>
              <button type="button" className={styles.close} onClick={() => setMapOpen(false)}>
                <CloseIcon />
                <span>Zapri</span>
              </button>
            </div>
            <div className={`${styles.mapFrame} ${styles.dialogMapFrame}`}>
              <StoreFloorPlan storeName={storeName} targetId={target?.id} className={styles.dialogMap} />
            </div>
            <div className={styles.dialogFoot}>
              {target && (
                <p className={styles.legend}>
                  <span className={styles.legendPin} aria-hidden="true" />
                  {target.label}
                  <span className={styles.legendDot} aria-hidden="true" />
                  Tvoja lokacija
                </p>
              )}
              <p className={styles.caption}>Slika je simbolična.</p>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
