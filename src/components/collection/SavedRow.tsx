"use client";
import { formatPrice, getPrimaryOffer, getProduct, PRICE_UNIT_LABEL } from "@/lib/catalog";
import { Icon } from "../ui/Icon";
import { PricePill } from "../product/PricePill";
import { PriceStack } from "../product/PriceStack";
import styles from "./SavedRow.module.css";

/**
 * One compact white row of "Moji izdelki": packshot, SPAR / INTERSPAR label, name, pack size,
 * grey regular price (struck through, only when a verified one exists) and the red price pill.
 * The whole row opens the product sheet; in removal mode a red minus circle appears on the left.
 */
export function SavedRow({
  productId,
  id,
  flash,
  editing,
  onOpen,
  onRemove,
}: {
  productId: string;
  /** DOM id for the #izdelek-<id> deep link. */
  id: string;
  flash: boolean;
  editing: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const product = getProduct(productId);
  const offer = getPrimaryOffer(productId);
  if (!product || !offer) return null;
  const unit = PRICE_UNIT_LABEL[offer.priceUnit];
  const regular = offer.regularPriceCents != null && offer.regularPriceCents > offer.priceCents ? offer.regularPriceCents : null;
  const label = `${product.brand ? product.brand + " " : ""}${product.name}, ${product.packSize}, ${formatPrice(offer.priceCents)}${unit ? " " + unit : ""}`;

  return (
    <li id={id} className={styles.row} data-product-id={productId} data-flash={flash || undefined} data-editing={editing || undefined}>
      {editing && (
        <button type="button" className={styles.remove} onClick={onRemove} aria-label={`Odstrani: ${product.name}`}>
          <span className={styles.minus} aria-hidden="true">
            <Icon name="minus" size={16} strokeWidth={3} />
          </span>
        </button>
      )}
      <button type="button" className={styles.hit} onClick={onOpen} aria-label={label}>
        <span className={styles.media}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image.src} width={product.image.width} height={product.image.height} alt="" loading="lazy" decoding="async" draggable={false} />
        </span>
        <span className={styles.text}>
          <span className={styles.name}>{product.name}</span>
          <span className={styles.pack}>
            {product.packSize}
            {unit && <span className={styles.unit}> · {unit}</span>}
          </span>
          {regular != null && (
            <span className={styles.regular}>
              Redna cena <s>{formatPrice(regular)}</s>
            </span>
          )}
        </span>
        <PriceStack productId={productId}>
          <PricePill cents={offer.priceCents} size="md" />
        </PriceStack>
      </button>
    </li>
  );
}
