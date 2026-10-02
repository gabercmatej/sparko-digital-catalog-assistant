"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useChat } from "@/lib/chat/useChat";
import { Icon } from "../ui/Icon";
import { Composer } from "./Composer";
import { MessageItem } from "./MessageItem";
import { ProductCarousel } from "./ProductCarousel";
import { Welcome } from "./Welcome";
import styles from "./Chat.module.css";

const NEAR_BOTTOM_PX = 120;

/** The Sparko chat page: carousel + welcome or conversation, and the composer. */
export function ChatView() {
  const { hydrated, conversation, isDemo, pending, send, retry, showProduct } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const forceScroll = useRef(false);
  const [showPill, setShowPill] = useState(false);

  const messages = conversation?.messages ?? [];
  const last = messages[messages.length - 1];
  const convId = conversation?.id ?? null;
  const signature = `${messages.length}:${last?.id ?? ""}:${last?.status ?? ""}`;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom.current && showPill) setShowPill(false);
  };

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setShowPill(false);
  }, []);

  /** Bring the newest exchange into view: last user message at the top, reply below it. */
  const revealLatest = useCallback((instant = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const users = el.querySelectorAll<HTMLElement>('[data-role="user"]');
    const lastUser = users[users.length - 1];
    const max = el.scrollHeight - el.clientHeight;
    let target = max;
    if (lastUser) {
      const top = lastUser.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 12;
      target = instant ? Math.min(max, top) : Math.max(el.scrollTop, Math.min(max, top));
    }
    el.scrollTo({ top: target, behavior: instant ? "auto" : "smooth" });
    setShowPill(false);
  }, []);

  // Switching conversations: jump to the end (or top for the welcome state).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = true;
    setShowPill(false);
    if (forceScroll.current && convId) {
      // A send/product click just created or forked this conversation.
      forceScroll.current = false;
      revealLatest(true);
      return;
    }
    el.scrollTop = convId ? el.scrollHeight : 0;
  }, [convId, revealLatest]);

  // New content in the same conversation.
  const prevSig = useRef({ convId, signature });
  useEffect(() => {
    const prev = prevSig.current;
    prevSig.current = { convId, signature };
    if (prev.convId !== convId || prev.signature === signature) return;
    if (forceScroll.current || nearBottom.current) {
      forceScroll.current = false;
      requestAnimationFrame(() => revealLatest());
    } else {
      setShowPill(true);
    }
  }, [convId, signature, revealLatest]);

  const handleSend = useCallback(
    (text: string) => {
      forceScroll.current = true;
      const ok = send(text);
      if (!ok) forceScroll.current = false;
      return ok;
    },
    [send],
  );
  const handleProduct = useCallback(
    (productId: string) => {
      forceScroll.current = true;
      showProduct(productId);
    },
    [showProduct],
  );

  const hasMessages = messages.length > 0;

  return (
    <div className={styles.page}>
      <div ref={scrollRef} className={`page-scroll ${styles.scroll}`} onScroll={onScroll} data-testid="chat-scroll">
        <ProductCarousel onSelect={handleProduct} />
        {!hydrated ? (
          <div className={styles.flexFill} />
        ) : hasMessages ? (
          <div className={styles.thread}>
            {isDemo && (
              <p className={styles.demoBanner}>
                <span className={styles.demoTag}>Primer</span>
                <span>Primer pogovora. Ko napišeš sporočilo, se nadaljuje kot tvoj pogovor.</span>
              </p>
            )}
            <div role="log" aria-live="polite" aria-label="Pogovor s Sparkom" className={styles.messages}>
              {messages.map((m) => (
                <MessageItem key={m.id} message={m} onChoice={handleSend} onRetry={retry} busy={pending} />
              ))}
            </div>
          </div>
        ) : (
          <Welcome onSuggestion={handleSend} disabled={pending} />
        )}
      </div>
      {showPill && (
        <button type="button" className={styles.pill} onClick={() => scrollToBottom(true)}>
          Nova sporočila
          <Icon name="chevron-down" size={16} strokeWidth={2.2} />
        </button>
      )}
      <Composer onSend={handleSend} busy={pending} />
    </div>
  );
}
