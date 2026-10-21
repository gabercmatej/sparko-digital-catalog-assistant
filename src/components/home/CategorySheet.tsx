"use client";
import { ProductSheet } from "../collection/ProductSheet";
import { Icon } from "../ui/Icon";
import { categoryOptions, type CategoryKey } from "./homeState";
import styles from "./CategorySheet.module.css";

/** Compact bottom sheet to pick a product category ("VSI" first). Picking calls onPick; the parent closes it. */
export function CategorySheet({ open, onClose, selected, onPick }: { open: boolean; onClose: () => void; selected: CategoryKey | null; onPick: (category: CategoryKey) => void }) {
  return (
    <ProductSheet open={open} onClose={onClose} label="Izberi kategorijo">
      <p className={styles.title} aria-hidden="true">
        Izdelki po kategoriji
      </p>
      <ul className={styles.list}>
        {categoryOptions().map((o) => (
          <li key={o.key}>
            <button type="button" className={styles.option} aria-pressed={selected === o.key} onClick={() => onPick(o.key)} data-category={o.key}>
              <span className={styles.label}>{o.label}</span>
              <span className={styles.count}>{o.count}</span>
              <Icon name={selected === o.key ? "check" : "chevron-right"} size={18} className={styles.icon} />
            </button>
          </li>
        ))}
      </ul>
    </ProductSheet>
  );
}
