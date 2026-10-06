"use client";
import { useRouter } from "next/navigation";
import { getProduct, leafletHref } from "@/lib/catalog";
import { asChatMessage, displayText } from "@/lib/chat/messages";
import { requestHighlight } from "@/lib/store/store";
import type { Message } from "@/lib/types";
import { Icon } from "../ui/Icon";
import { NearestStoreCard } from "./demo/NearestStoreCard";
import { StoreMapCard } from "./demo/StoreMapCard";
import { ProductsBlock } from "./ProductsBlock";
import { RecipeCard } from "./RecipeCard";
import styles from "./Chat.module.css";

export function MessageItem({
  message,
  onChoice,
  onRetry,
  busy,
}: {
  message: Message;
  onChoice: (text: string) => void;
  onRetry: (messageId: string) => void;
  busy: boolean;
}) {
  const router = useRouter();
  const m = asChatMessage(message);

  if (m.role === "user") {
    return (
      <div className={styles.userRow} data-role="user">
        <p className={styles.userBubble}>{m.text}</p>
      </div>
    );
  }

  if (m.status === "pending") {
    return (
      <div className={styles.assistant} data-role="assistant">
        <span className={styles.label}>Sparko</span>
        <div className={styles.typing} role="status" aria-label="Sparko piše odgovor">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (m.status === "error") {
    return (
      <div className={styles.assistant} data-role="assistant">
        <span className={styles.label}>Sparko</span>
        <p className={styles.errorText} role="alert">
          <Icon name="info" size={18} />
          <span>{m.text || "Odgovor je bil prekinjen."}</span>
        </p>
        <button type="button" className={`btn btn-secondary btn-sm ${styles.retry}`} onClick={() => onRetry(m.id)} disabled={busy}>
          <Icon name="refresh" size={16} />
          Poskusi znova
        </button>
      </div>
    );
  }

  const leafletProducts = (m.actions ?? []).filter((a) => a.type === "open_leaflet" && getProduct(a.productId)).map((a) => a.productId);

  return (
    <div className={styles.assistant} data-role="assistant">
      <div className={styles.labelRow}>
        <span className={styles.label}>Sparko</span>
        {m.mode === "fallback" && (
          <span className={styles.fallback} title={m.modeNotice}>
            Omejen način: odgovor brez jezikovnega modela
          </span>
        )}
      </div>
      {m.text && <p className={styles.text}>{displayText(m.text)}</p>}
      {m.blocks?.map((b, i) => {
        switch (b.type) {
          case "products":
            return <ProductsBlock key={i} offerIds={b.offerIds} reasons={b.reasons} layout={b.layout} />;
          case "recipe":
            return <RecipeCard key={i} recipeId={b.recipeId} />;
          case "choices":
            return (
              <div key={i} className={styles.choices}>
                {b.prompt && <p className={styles.choicesPrompt}>{b.prompt}</p>}
                <div className={styles.chips}>
                  {b.options.map((o) => (
                    <button key={o.label} type="button" className={styles.chip} onClick={() => onChoice(o.message)} disabled={busy}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          case "notice":
            return (
              <p key={i} className={styles.notice} data-tone={b.tone}>
                <Icon name="info" size={16} />
                <span>{b.text}</span>
              </p>
            );
          case "nearest_store":
            return <NearestStoreCard key={i} />;
          case "store_map":
            return <StoreMapCard key={i} sectionId={b.sectionId} />;
          default:
            return null;
        }
      })}
      {leafletProducts.map((pid) => (
        <button
          key={pid}
          type="button"
          className={`btn btn-secondary ${styles.leafletBtn}`}
          onClick={() => {
            requestHighlight(pid);
            router.push(leafletHref(pid));
          }}
        >
          <Icon name="leaflet" size={18} />
          Odpri v SPAR letaku
        </button>
      ))}
    </div>
  );
}
