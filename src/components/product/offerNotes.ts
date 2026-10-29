import { availabilityText } from "@/lib/catalog";
import { offerState, offerStatusText } from "@/lib/offerStatus";
import type { Offer } from "@/lib/types";

/**
 * Status of an offer for display: `current` offers keep the red price; anything else (expired, historical, not yet
 * valid) gets the muted neutral price plus the status line. `availability` is the store restriction, if any.
 */
export function offerNotes(o: Offer): { current: boolean; status: string | null; availability: string | null } {
  return { current: offerState(o) === "current", status: offerStatusText(o), availability: availabilityText(o) };
}
