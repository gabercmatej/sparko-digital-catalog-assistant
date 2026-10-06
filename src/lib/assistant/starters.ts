/** Starter prompts shown on the empty chat and the deterministic follow-up questions. No imports: safe for client code. */
export const ASK_PRODUCT_TEXT = "Seveda. Kateri izdelek te zanima?";

/** Follow-up for "Kje v trgovini je izdelek?"; the next short reply is resolved as an in-store location lookup. */
export const ASK_STORE_PRODUCT_TEXT = "Seveda. Kateri izdelek iščeš v trgovini?";

export const STARTER_PROMPTS: { label: string; message: string }[] = [
  { label: "Koliko stane izdelek?", message: "Koliko stane izdelek?" },
  { label: "Kaj je najbolj znižano?", message: "Kaj je najbolj znižano?" },
  { label: "Kje je meni najbližji SPAR?", message: "Kje je meni najbližji SPAR?" },
  { label: "Kje v trgovini je izdelek?", message: "Kje v trgovini je izdelek?" },
];
