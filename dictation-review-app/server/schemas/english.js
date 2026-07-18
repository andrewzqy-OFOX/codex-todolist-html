import { z } from "zod";
import { EnrichmentEnvelopeBaseSchema } from "./common.js";

export const EnglishRequestSchema = z
  .object({
    word: z.string().trim().min(1).max(64).regex(/^[A-Za-z][A-Za-z'-]*$/)
  })
  .strict();

export const EnglishDataSchema = z
  .object({
    normalizedWord: z.string(),
    ukPhonetic: z.string(),
    usPhonetic: z.string(),
    partsOfSpeech: z.array(z.string()),
    meaningsZh: z.array(z.string()).max(3),
    alternativeCandidates: z.array(z.string())
  })
  .strict();

export const EnglishResponseSchema = EnrichmentEnvelopeBaseSchema.extend({
  data: EnglishDataSchema
}).strict();

