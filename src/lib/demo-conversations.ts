/**
 * Three seeded example conversations ("Primeri pogovorov"). Built from the verified
 * catalog at module load: prices and pages are computed, never hard-coded.
 * They are static (never persisted); continuing one forks a user conversation.
 */
import { formatPrice, getOffer, getPlacements, getPrimaryOffer, getProduct, products, recipes, recipeTotals } from "./catalog";
import { productSummary, type ChatMessage } from "./chat/messages";
import type { Conversation } from "./types";

const BASE = Date.UTC(2026, 8, 30, 8, 0, 0); // 30. 9. 2026 (catalog date)

function conv(id: string, title: string, offsetMin: number, messages: Omit<ChatMessage, "createdAt" | "status">[]): Conversation {
  const created = BASE + offsetMin * 60_000;
  return {
    id,
    kind: "demo",
    title,
    createdAt: created,
    updatedAt: created + messages.length * 1000,
    messages: messages.map((m, i) => ({ ...m, createdAt: created + i * 1000, status: "ok" as const })),
  };
}

// ---------------------------------------------------------------- 1. skuta

const SKUTA_OFFER = "offer-sb-skuta-1kg-4026";
function skutaConversation(): Conversation {
  const offer = getOffer(SKUTA_OFFER);
  const product = offer ? getProduct(offer.productId) : undefined;
  if (!offer || !product) {
    return conv("demo-skuta", "Koliko stane skuta?", 0, [
      { id: "demo-skuta-1", role: "user", text: "Koliko stane skuta?" },
      { id: "demo-skuta-2", role: "assistant", mode: "deterministic", text: "Skute v tem demo katalogu trenutno ne najdem." },
    ]);
  }
  const pl = getPlacements(offer.id)[0];
  const where = pl
    ? `${product.name} je v SPAR letaku na PDF-strani ${pl.pdfPageNumber}${pl.printedPageLabel ? ` (natisnjena stran ${pl.printedPageLabel})` : ""}. Z gumbom spodaj odpreš letak na tej strani.`
    : `Za ${product.name.toLowerCase()} nimam preverjene lokacije v letaku.`;
  return conv("demo-skuta", "Koliko stane skuta?", 0, [
    { id: "demo-skuta-1", role: "user", text: "Koliko stane skuta?" },
    {
      id: "demo-skuta-2",
      role: "assistant",
      mode: "deterministic",
      text: `${productSummary(product.id) ?? product.name} Cena je iz demo kataloga.`,
      blocks: [{ type: "products", offerIds: [offer.id], layout: "card" }],
      contextProductIds: [product.id],
    },
    { id: "demo-skuta-3", role: "user", text: "Kje je v letaku?", contextProductIds: [product.id] },
    {
      id: "demo-skuta-4",
      role: "assistant",
      mode: "deterministic",
      text: where,
      contextProductIds: [product.id],
      ...(pl ? { actions: [{ type: "open_leaflet" as const, productId: product.id }] } : {}),
    },
  ]);
}

// ---------------------------------------------------------------- 2. S-BUDGET

function sbudgetConversation(): Conversation {
  const list = products.filter((p) => p.line === "S-BUDGET" && getPrimaryOffer(p.id));
  const offerIds = list.map((p) => getPrimaryOffer(p.id)!.id);
  const cheapest = [...list].sort((a, b) => getPrimaryOffer(a.id)!.priceCents - getPrimaryOffer(b.id)!.priceCents)[0];
  const text = list.length
    ? `V demo katalogu sem našel ${list.length} ${list.length === 1 ? "izdelek" : list.length === 2 ? "izdelka" : list.length < 5 ? "izdelke" : "izdelkov"} linije S-BUDGET. Najcenejši je ${cheapest.name.toLowerCase()} (${cheapest.packSize}) za ${formatPrice(getPrimaryOffer(cheapest.id)!.priceCents)}. Tapni izdelek za podrobnosti.`
    : "V tem demo katalogu ne najdem izdelkov linije S-BUDGET.";
  return conv("demo-sbudget", "Ponudba S-BUDGET", 30, [
    { id: "demo-sbudget-1", role: "user", text: "Kaj je v ponudbi S-BUDGET?" },
    {
      id: "demo-sbudget-2",
      role: "assistant",
      mode: "deterministic",
      text,
      ...(list.length ? { blocks: [{ type: "products" as const, offerIds, layout: "list" as const }] } : {}),
      contextProductIds: list.map((p) => p.id),
    },
  ]);
}

// ---------------------------------------------------------------- 3. dinner for two ≤ 10 €

function dinnerConversation(): Conversation {
  const recipe = recipes.find((r) => r.kind === "dinner");
  const totals = recipe ? recipeTotals(recipe) : null;
  const user = { id: "demo-vecerja-1", role: "user" as const, text: "Večerja za dva do 10 €" };
  if (!recipe || !totals) {
    return conv("demo-vecerja", "Večerja za dva do 10 €", 60, [
      user,
      {
        id: "demo-vecerja-2",
        role: "assistant",
        mode: "deterministic",
        text: "Preverjenega recepta za večerjo za dva v tem demo katalogu še nimam, zato ti ne bom ugibal cene. Lahko ti pokažem izdelke iz kataloga.",
        blocks: [{ type: "choices", options: [{ label: "Pokaži S-BUDGET izdelke", message: "Kaj je v ponudbi S-BUDGET?" }] }],
      },
    ]);
  }
  const budget = recipe.budgetCents;
  const within = budget != null && totals.withCard <= budget && (!totals.needsCard || (totals.withoutCard != null && totals.withoutCard <= budget));
  const cardNote = totals.needsCard ? " (s kartico SPAR plus)" : "";
  const text = `Predlagam: ${recipe.title} za ${recipe.servings} ${recipe.servings === 2 ? "osebi" : "osebe"}. Cela pakiranja skupaj stanejo ${formatPrice(totals.withCard)}${cardNote}${
    within && budget != null ? `, kar je v okviru ${formatPrice(budget)}` : ""
  }. Spodaj so količine, preračun in predpostavke.`;
  return conv("demo-vecerja", "Večerja za dva do 10 €", 60, [
    user,
    {
      id: "demo-vecerja-2",
      role: "assistant",
      mode: "deterministic",
      text,
      blocks: [{ type: "recipe", recipeId: recipe.id }],
      contextProductIds: recipe.ingredients.map((i) => getOffer(i.offerId)?.productId).filter((x): x is string => !!x),
    },
  ]);
}

export const DEMO_CONVERSATIONS: Conversation[] = [skutaConversation(), sbudgetConversation(), dinnerConversation()];

export function getDemoConversation(id: string | null | undefined): Conversation | undefined {
  return id ? DEMO_CONVERSATIONS.find((c) => c.id === id) : undefined;
}

export function isDemoId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("demo-");
}
