/** Starter prompts shown on the empty chat and the deterministic follow-up questions. No imports: safe for client code. */
export const ASK_PRODUCT_TEXT = "Seveda. Kateri izdelek te zanima?";

/** Follow-up for "Kje v trgovini je izdelek?"; the next short reply is resolved as an in-store location lookup. */
export const ASK_STORE_PRODUCT_TEXT = "Seveda. Kateri izdelek iščeš v trgovini?";

/** Follow-up for the generic "Kdaj bo izdelek najbolj znižan?"; the next short reply is resolved as a timing query for that product. */
export const ASK_TIMING_PRODUCT_TEXT = "Seveda! Za kateri izdelek te zanima, kdaj bo v akciji?";

export const STARTER_PROMPTS: { label: string; message: string }[] = [
  { label: "Koliko stane izdelek v katalogu?", message: "Koliko stane izdelek v katalogu?" },
  { label: "Kaj je najbolj znižano v katalogu?", message: "Kaj je najbolj znižano v katalogu?" },
  { label: "Kje je meni najbližji SPAR?", message: "Kje je meni najbližji SPAR?" },
  { label: "Kdaj bo izdelek najbolj znižan?", message: "Kdaj bo izdelek najbolj znižan?" },
];
