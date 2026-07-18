import { z } from "zod";
import { EnrichmentEnvelopeBaseSchema } from "./common.js";

export const CharacterRequestSchema = z
  .object({
    character: z.string().trim().length(1),
    originalText: z.string().trim().min(1).max(120)
  })
  .strict();

const RelatedWordSchema = z
  .object({
    word: z.string(),
    pinyin: z.string(),
    definition: z.string()
  })
  .strict();

export const CharacterDataSchema = z
  .object({
    character: z.string(),
    pinyin: z.string(),
    relatedWords: z.array(RelatedWordSchema).max(2),
    recommendationReason: z.string()
  })
  .strict();

export const CharacterResponseSchema = EnrichmentEnvelopeBaseSchema.extend({
  data: CharacterDataSchema
}).strict();

