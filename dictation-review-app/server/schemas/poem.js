import { z } from "zod";
import { EnrichmentEnvelopeBaseSchema } from "./common.js";

export const PoemRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    authorHint: z.string().trim().max(40).default("")
  })
  .strict();

const PoemLineSchema = z
  .object({
    order: z.number().int().positive(),
    text: z.string()
  })
  .strict();

const AnnotationSchema = z
  .object({
    term: z.string(),
    explanation: z.string()
  })
  .strict();

const PoemCandidateSchema = z
  .object({
    title: z.string(),
    author: z.string(),
    dynasty: z.string(),
    reason: z.string()
  })
  .strict();

export const PoemDataSchema = z
  .object({
    title: z.string(),
    alternativeTitle: z.string(),
    author: z.string(),
    dynasty: z.string(),
    fullText: z.string(),
    lines: z.array(PoemLineSchema),
    annotations: z.array(AnnotationSchema),
    translation: z.string(),
    candidates: z.array(PoemCandidateSchema),
    versionWarnings: z.array(z.string())
  })
  .strict();

export const PoemResponseSchema = EnrichmentEnvelopeBaseSchema.extend({
  data: PoemDataSchema
}).strict();

