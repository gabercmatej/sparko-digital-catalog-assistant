import Link from "next/link";
import type { Metadata } from "next";
import { catalog, products } from "@/lib/catalog";
import { ProductTile } from "@/components/product/ProductTile";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Domov · Sparko" };

/** Demo home page. Visual only: the promo cards are a static picture, not working features. */
export default function HomePage() {
  const cover = catalog.pages[0].thumb;
  return (
    <div className={`page-scroll ${styles.home}`}>
      <section className={styles.hello}>
        <h1 className={styles.title}>Pozdravljeni!</h1>
        <p className={styles.sub}>Dobrodošli v Spar svetu ugodnosti.</p>
      </section>

      <ul className={styles.strip} aria-label="Izdelki v akciji">
        {products.slice(0, 10).map((p) => (
          <li key={p.id}>
            <ProductTile productId={p.id} size="carousel" />
          </li>
        ))}
      </ul>

      {/* Promo cards are a static picture: visual only, not working features. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/home/promo-cards.webp"
        width={994}
        height={1475}
        className={styles.promos}
        alt="Lov na izdelke · Popularne mini igrice · Sestavi kodo"
      />

      <section className={styles.catalogs}>
        <h2 className={styles.h2}>SPAR katalogi</h2>
        <Link href="/letak" className={styles.catalog}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover.src} width={cover.width} height={cover.height} alt="" />
          <span>
            <strong>{catalog.title}</strong>
            <span>{catalog.pageCount} strani · Odpri katalog</span>
          </span>
        </Link>
      </section>
    </div>
  );
}
