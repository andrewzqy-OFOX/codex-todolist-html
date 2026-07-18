import { z } from "zod";

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);

export const SourceSchema = z
  .object({
    title: z.string(),
    publisher: z.string(),
    url: z.string()
  })
  .strict();

export const EnrichmentEnvelopeBaseSchema = z
  .object({
    success: z.literal(true),
    confidence: ConfidenceSchema,
    warnings: z.array(z.string()),
    ambiguities: z.array(z.string()),
    sources: z.array(SourceSchema),
    fetchedAt: z.string()
  })
  .strict();

export function toStrictJsonSchema(schema, name) {
  const jsonSchema = z.toJSONSchema(schema);
  return {
    type: "json_schema",
    name,
    strict: true,
    schema: jsonSchema
  };
}

export function makeError(code, message, status = 500, details = []) {
  return {
    status,
    body: {
      success: false,
      error: {
        code,
        message,
        details
      }
    }
  };
}

