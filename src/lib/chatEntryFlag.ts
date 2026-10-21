/** Short-lived, module-level flag: set when Home hands off to the chat via the entry transition. */
let armedAt = 0;
const TTL_MS = 4000;

export function armChatEntryReveal() {
  armedAt = Date.now();
}

/** True when the chat was just opened through the Home transition. Safe to call repeatedly. */
export function peekChatEntryReveal() {
  return armedAt > 0 && Date.now() - armedAt < TTL_MS;
}

export function clearChatEntryReveal() {
  armedAt = 0;
}
