"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MAX_INPUT_CHARS } from "@/lib/chat/messages";
import { Icon } from "../ui/Icon";
import { useShell } from "../shell/AppShell";
import styles from "./Composer.module.css";

const COUNTER_FROM = MAX_INPUT_CHARS - 100;

/**
 * Chat input. Enter sends, Shift+Enter adds a newline. Auto-grows up to ~4 lines.
 * The microphone is a visible "coming soon" control and never requests permission.
 */
export function Composer({ onSend, busy }: { onSend: (text: string) => boolean; busy: boolean }) {
  const [value, setValue] = useState("");
  const [micHint, setMicHint] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { keyboardOpen } = useShell();
  const canSend = value.trim().length > 0 && !busy;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 4 * 22 + 20)}px`;
  }, [value]);

  useEffect(() => {
    if (!micHint) return;
    const t = window.setTimeout(() => setMicHint(false), 2200);
    return () => window.clearTimeout(t);
  }, [micHint]);

  const submit = () => {
    if (!canSend) return;
    if (onSend(value)) setValue("");
  };

  return (
    <form
      className={styles.composer}
      data-nav-hidden={keyboardOpen || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {value.length >= COUNTER_FROM && (
        <span id="chat-counter" className={styles.counter} data-full={value.length >= MAX_INPUT_CHARS || undefined}>
          {value.length}/{MAX_INPUT_CHARS}
        </span>
      )}
      <div className={styles.field}>
        <label htmlFor="chat-input" className="sr-only">
          Sporočilo za Sparka
        </label>
        <textarea
          id="chat-input"
          ref={ref}
          className={styles.input}
          rows={1}
          placeholder="Vprašaj Sparka …"
          value={value}
          maxLength={MAX_INPUT_CHARS}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => setValue(e.target.value.slice(0, MAX_INPUT_CHARS))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          aria-describedby={value.length >= COUNTER_FROM ? "chat-counter" : undefined}
        />
        <div className={styles.micWrap}>
          <button
            type="button"
            className={styles.mic}
            aria-disabled="true"
            aria-label="Glasovni vnos – kmalu"
            aria-describedby={micHint ? "mic-hint" : undefined}
            onClick={() => setMicHint(true)}
          >
            <Icon name="mic" size={20} />
          </button>
          {micHint && (
            <span id="mic-hint" role="status" className={styles.micHint}>
              Kmalu
            </span>
          )}
        </div>
        <button type="submit" className={styles.send} disabled={!canSend} aria-label={busy ? "Sparko odgovarja …" : "Pošlji"}>
          <Icon name="send" size={20} strokeWidth={2.4} />
        </button>
      </div>
    </form>
  );
}
