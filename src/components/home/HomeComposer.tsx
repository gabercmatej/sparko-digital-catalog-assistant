"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { armChatEntryReveal } from "@/lib/chatEntryFlag";
import { composerAction, MAX_INPUT_CHARS } from "@/lib/chat/messages";
import { sendFromHome, useChat } from "@/lib/chat/useChat";
import { Icon } from "../ui/Icon";
import composer from "../chat/Composer.module.css";
import styles from "./HomeComposer.module.css";

/**
 * Home's entry to the Sparko chat: the Chat composer's field (same pill, type, icons and placeholder) on one
 * line. Enter / Send starts a NEW conversation with the question (see sendFromHome; earlier chats stay in History)
 * and then opens the Chat tab, where the answer appears. Home itself never shows a conversation.
 */
export function HomeComposer() {
  const router = useRouter();
  const { hydrated } = useChat();
  const [value, setValue] = useState("");
  // Guards the hand-off against a double Enter / tap before the route changes (one submit = one conversation).
  const sending = useRef(false);
  const action = composerAction(value);
  const canSend = action === "send" && hydrated;

  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  const submit = () => {
    if (!canSend || sending.current) return;
    sending.current = true;
    if (!sendFromHome(value)) {
      sending.current = false;
      return;
    }
    setValue("");
    armChatEntryReveal();
    router.push("/");
  };

  return (
    <form
      className={styles.form}
      data-home-composer
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={`${composer.field} ${styles.field}`}>
        <label htmlFor="home-chat-input" className="sr-only">
          Vprašaj Sparka
        </label>
        <input
          id="home-chat-input"
          className={`${composer.input} ${styles.input}`}
          type="text"
          placeholder="Vprašaj Sparka o katalogu …"
          value={value}
          maxLength={MAX_INPUT_CHARS}
          enterKeyHint="send"
          autoComplete="off"
          // Until the store is loaded nothing can be sent, so nothing can be typed (and lost to a native submit) either.
          readOnly={!hydrated}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_INPUT_CHARS))}
        />
        <button
          type={action === "send" ? "submit" : "button"}
          className={action === "send" ? composer.send : composer.mic}
          data-action={action}
          disabled={action === "send" ? !canSend : undefined}
          aria-disabled={action === "mic" ? "true" : undefined}
          aria-label={action === "mic" ? "Glasovni vnos bo na voljo kmalu" : "Pošlji"}
          title={action === "mic" ? "Glasovni vnos bo na voljo kmalu" : undefined}
          onClick={action === "mic" ? (e) => e.preventDefault() : undefined}
        >
          {action === "mic" ? <Icon name="mic" size={20} /> : <Icon name="send" size={20} strokeWidth={2.4} />}
        </button>
      </div>
    </form>
  );
}
