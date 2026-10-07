"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { composerAction, MAX_INPUT_CHARS } from "@/lib/chat/messages";
import { Icon } from "../ui/Icon";
import { useShell } from "../shell/AppShell";
import styles from "./Composer.module.css";

const COUNTER_FROM = MAX_INPUT_CHARS - 100;

/**
 * Chat input. Enter sends, Shift+Enter adds a newline. Auto-grows up to ~4 lines.
 * Empty input shows an inactive voice hint (never requests the microphone); typed text turns it into Send.
 */
export function Composer({ onSend, busy }: { onSend: (text: string) => boolean; busy: boolean }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const { keyboardOpen } = useShell();
  const action = composerAction(value);
  const canSend = action === "send" && !busy;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 4 * 22 + 20)}px`;
  }, [value]);

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
          placeholder="Vprašaj Sparka o katalogu …"
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
        {/* One trailing action: inactive voice hint while empty, Send once there is text. */}
        <button
          type={action === "send" ? "submit" : "button"}
          className={action === "send" ? styles.send : styles.mic}
          data-action={action}
          disabled={action === "send" ? !canSend : undefined}
          aria-disabled={action === "mic" ? "true" : undefined}
          aria-label={action === "mic" ? "Glasovni vnos bo na voljo kmalu" : busy ? "Sparko odgovarja …" : "Pošlji"}
          title={action === "mic" ? "Glasovni vnos bo na voljo kmalu" : undefined}
          onClick={action === "mic" ? (e) => e.preventDefault() : undefined}
        >
          {action === "mic" ? <Icon name="mic" size={20} /> : <Icon name="send" size={20} strokeWidth={2.4} />}
        </button>
      </div>
    </form>
  );
}
