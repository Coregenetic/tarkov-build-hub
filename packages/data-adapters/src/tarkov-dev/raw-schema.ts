import { z } from "zod";

/**
 * Rohformat von json.tarkov.dev, nur so streng wie nötig.
 * Unbekannte Felder bleiben erhalten (passthrough), damit Formatänderungen
 * nicht still Daten verlieren.
 */

const nullableNumber = z.number().nullable().optional();
const nullableString = z.string().nullable().optional();

export const rawSlotSchema = z
  .object({
    id: z.string(),
    nameId: z.string(),
    name: z.string().nullable().optional(),
    required: z.boolean().nullable().optional(),
    filters: z
      .object({
        allowedItems: z.array(z.string()).optional().default([]),
        allowedCategories: z.array(z.string()).optional().default([]),
        excludedItems: z.array(z.string()).optional().default([]),
        excludedCategories: z.array(z.string()).optional().default([]),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const rawItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    shortName: z.string().optional(),
    normalizedName: z.string(),
    updated: nullableString,
    width: nullableNumber,
    height: nullableNumber,
    weight: nullableNumber,
    types: z.array(z.string()).optional().default([]),
    categories: z.array(z.string()).optional().default([]),
    basePrice: nullableNumber,
    avg24hPrice: nullableNumber,
    low24hPrice: nullableNumber,
    lastScan: nullableString,
    iconLink: nullableString,
    gridImageLink: nullableString,
    baseImageLink: nullableString,
    inspectImageLink: nullableString,
    image512pxLink: nullableString,
    image8xLink: nullableString,
    containsItems: z
      .array(z.object({ item: z.string(), count: z.number() }).passthrough())
      .optional()
      .default([]),
    conflictingItems: z.array(z.string()).optional().default([]),
    conflictingCategories: z.array(z.string()).optional().default([]),
    conflictingSlotIds: z.array(z.string()).optional().default([]),
    properties: z
      .object({
        propertiesType: z.string().optional(),
        slots: z.array(rawSlotSchema).optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const rawItemsFileSchema = z
  .object({
    data: z
      .object({
        items: z.record(z.string(), z.unknown()),
      })
      .passthrough(),
  })
  .passthrough();

export const rawTranslationFileSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

export type RawItem = z.infer<typeof rawItemSchema>;
export type RawSlot = z.infer<typeof rawSlotSchema>;
