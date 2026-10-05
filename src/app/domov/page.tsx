import Link from "next/link";
import type { Metadata } from "next";
import { catalog, products } from "@/lib/catalog";
import { ProductTile } from "@/components/product/ProductTile";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Domov · Sparko" };

const img = (id: string) => products.find((p) => p.id === id)?.image.src;

/** Demo home page. Visual only: the promo cards are placeholders, not working features. */
export default function HomePage() {
  const cover = catalog.pages[0].thumb;
  return (
    <div className={`page-scroll ${styles.home}`}>
      <section className={styles.hello}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/spar-logo.svg" alt="SPAR" className={styles.spar} width={120} height={21} />
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

      <div className={styles.cards}>
        <section className={`${styles.promo} ${styles.hunt}`}>
          <div className={styles.promoText}>
            <h2>Lov na izdelke</h2>
            <p>Poišči vse Spar izdelke v najbližji trgovini SPAR, jih fotografiraj in sodeluj v nagradni igri!</p>
            <span className={styles.pill}>Sodeluj</span>
          </div>
          <div className={styles.collage} aria-hidden="true">
            {["jabolka-gala-1kg", "sb-grozdje-500g", "jagode-250g", "avokado-kos"].map((id) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={id} src={img(id)} alt="" />
            ))}
          </div>
        </section>

        <section className={`${styles.promo} ${styles.games}`}>
          <h2>Popularne mini igrice</h2>
          <div className={styles.gameGrid}>
            {[
              { name: "Izberi pravo košarico", ids: ["sb-krompir-5kg", "mleko-trajno-1l"] },
              { name: "Ujemi izdelke", ids: ["sb-borovnice-300g", "jajca-xl-10"] },
            ].map((g) => (
              <div key={g.name} className={styles.game}>
                <div className={styles.gameArt} aria-hidden="true">
                  {g.ids.map((id) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={id} src={img(id)} alt="" />
                  ))}
                </div>
                <div className={styles.gameRow}>
                  <span>{g.name}</span>
                  <span className={styles.pill}>Igraj</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${styles.promo} ${styles.code}`}>
          <div className={styles.promoText}>
            <h2>Sestavi kodo</h2>
            <p>Najdi vse delčke kode in osvoji nagrado.</p>
            <span className={styles.pill}>Poišči</span>
          </div>
          <div className={styles.puzzle} aria-hidden="true">
            {"SPAR".split("").map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
        </section>
      </div>

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
