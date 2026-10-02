import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int().nonnegative();
const unit = z.number().min(0).max(1);
const publicPath = z.string().regex(/^\/[a-z0-9/_.-]+$/, "public path must be lowercase, start with /");
const imageRef = z.object({ src: publicPath, width: z.number().int().positive(), height: z.number().int().positive() });

export const catalogPageSchema = z.object({
  pdfPageIndex: z.number().int().nonnegative(),
  pdfPageNumber: z.number().int().positive(),
  printedPageLabel: z.string().nullable(),
  image: imageRef,
  thumb: imageRef,
  theme: z.string().nullable(),
});

export const productSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  brand: z.string().nullable(),
  line: z.string().nullable(),
  descriptor: z.string().nullable(),
  packSize: z.string().min(1),
  quantity: z.object({ amount: z.number().positive(), unit: z.enum(["g", "kg", "ml", "l", "kos"]) }).nullable(),
  categories: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
  aliases: z.array(z.string().min(1)),
  image: imageRef.extend({ provenance: z.string().min(1) }),
  theme: z.string().nullable(),
  editorialRank: z.number().int(),
});

export const offerSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  productId: z.string(),
  catalogId: z.string(),
  priceCents: cents.positive(),
  priceUnit: z.enum(["pack", "kg", "100g", "kos"]),
  priceKind: z.enum(["catalog_price", "loyalty_price", "coupon_price"]),
  regularPriceCents: cents.nullable(),
  discountPercent: z.number().int().min(1).max(90).nullable(),
  conditions: z.object({ spPlusRequired: z.boolean(), couponRequired: z.boolean(), note: z.string().nullable() }),
  validity: z.object({
    status: z.enum(["explicit", "catalog_default", "unknown"]),
    from: isoDate.nullable(),
    to: isoDate.nullable(),
    evidence: z.string().nullable(),
  }),
  sourceQuote: z.string().min(1),
  verification: z.object({
    status: z.enum(["verified", "partial"]),
    checkedOn: isoDate,
    method: z.string().min(1),
    notes: z.string().nullable(),
  }),
});

export const placementSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  offerId: z.string(),
  pdfPageIndex: z.number().int().nonnegative(),
  pdfPageNumber: z.number().int().positive(),
  printedPageLabel: z.string().nullable(),
  bbox: z.object({ x: unit, y: unit, width: unit.positive(), height: unit.positive() }),
});

export const recipeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  kind: z.enum(["dinner", "breakfast", "lunch"]),
  servings: z.number().int().positive(),
  budgetCents: cents.nullable(),
  ingredients: z
    .array(
      z.object({
        offerId: z.string(),
        requiredQuantity: z.string().min(1),
        packsNeeded: z.number().int().positive(),
        conversionNote: z.string().min(1),
      }),
    )
    .min(1),
  pantryAssumptions: z.array(z.string()),
  steps: z.array(z.string()).min(1),
  minutes: z.number().int().positive().nullable(),
});

export const catalogDataSchema = z.object({
  version: z.number().int(),
  catalog: z.object({
    id: z.string(),
    title: z.string(),
    issueLabel: z.string(),
    publishedDate: isoDate,
    sourceFile: z.string(),
    pdfUrl: publicPath,
    pageCount: z.number().int().positive(),
    pages: z.array(catalogPageSchema),
  }),
  products: z.array(productSchema),
  offers: z.array(offerSchema),
  placements: z.array(placementSchema),
  recipes: z.array(recipeSchema),
});

// ---------------------------------------------------------------- chat API

export const MAX_MESSAGE_CHARS = 600;
export const MAX_HISTORY = 12;

export const chatRequestSchema = z.object({
  conversationId: z.string().min(1).max(80),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(4000),
        contextProductIds: z.array(z.string().max(80)).max(20).optional(),
      }),
    )
    .min(1)
    .max(MAX_HISTORY)
    // zod 4 still runs refinements after a failed .min(1); guard against empty arrays.
    .refine((m) => m.length > 0 && m[m.length - 1].role === "user", "last message must be from user")
    .refine((m) => {
      if (m.length === 0) return false;
      const t = m[m.length - 1].text.trim();
      return t.length > 0 && t.length <= MAX_MESSAGE_CHARS;
    }, "user message empty or too long"),
  savedProductIds: z.array(z.string().max(80)).max(100),
  spPlus: z.enum(["yes", "no", "unset"]),
});
