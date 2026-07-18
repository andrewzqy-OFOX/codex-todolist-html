import { z } from "zod";
import { EnrichmentEnvelopeBaseSchema } from "./common.js";

export const ChineseRequestSchema = z
  .object({
    term: z.string().trim().min(1).max(40)
  })
  .strict();

export const ChineseDataSchema = z
  .object({
    normalizedTerm: z.string(),
    pinyin: z.string(),
    definition: z.string(),
    synonyms: z.array(z.string()),
    antonyms: z.array(z.string()),
    pronunciationCandidates: z.array(z.string())
  })
  .strict();

export const ChineseResponseSchema = EnrichmentEnvelopeBaseSchema.extend({
  data: ChineseDataSchema
}).strict();

