import { ZodError } from "zod";
import { makeError, toStrictJsonSchema } from "../schemas/common.js";
import { ChineseRequestSchema, ChineseResponseSchema } from "../schemas/chinese.js";
import { CharacterRequestSchema, CharacterResponseSchema } from "../schemas/character.js";
import { EnglishRequestSchema, EnglishResponseSchema } from "../schemas/english.js";
import { PoemRequestSchema, PoemResponseSchema } from "../schemas/poem.js";
import { getRuntimeConfig } from "./config.js";
import {
  buildCharacterPrompt,
  buildChinesePrompt,
  buildEnglishPrompt,
  buildPoemPrompt,
  systemPrompt
} from "./prompts.js";

const ROUTES = {
  english: {
    requestSchema: EnglishRequestSchema,
    responseSchema: EnglishResponseSchema,
    jsonSchemaName: "english_enrichment",
    promptBuilder: buildEnglishPrompt
  },
  chinese: {
    requestSchema: ChineseRequestSchema,
    responseSchema: ChineseResponseSchema,
    jsonSchemaName: "chinese_enrichment",
    promptBuilder: buildChinesePrompt
  },
  poem: {
    requestSchema: PoemRequestSchema,
    responseSchema: PoemResponseSchema,
    jsonSchemaName: "poem_enrichment",
    promptBuilder: buildPoemPrompt
  },
  character: {
    requestSchema: CharacterRequestSchema,
    responseSchema: CharacterResponseSchema,
    jsonSchemaName: "character_enrichment",
    promptBuilder: buildCharacterPrompt
  }
};

function zodDetails(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}

function parseResponsePayload(response) {
  if (response?.status === "incomplete") {
    throw makeError("OPENAI_INCOMPLETE", "模型返回未完成，请稍后重试。", 502);
  }

  if (response?.status === "failed") {
    throw makeError("OPENAI_REQUEST_FAILED", "模型请求失败，请稍后重试。", 502);
  }

  const outputText = response?.output_text;
  if (typeof outputText !== "string" || !outputText.trim()) {
    throw makeError("MODEL_REFUSED", "模型未返回可用的结构化 JSON。", 502);
  }

  try {
    return JSON.parse(outputText);
  } catch {
    throw makeError("VALIDATION_FAILED", "模型返回的 JSON 无法解析。", 502);
  }
}

function withTimeout(promiseFactory, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return promiseFactory(controller.signal)
    .catch((error) => {
      if (error?.name === "AbortError") {
        throw makeError("NETWORK_TIMEOUT", "联网查询超时，请稍后重试。", 504);
      }
      throw error;
    })
    .finally(() => clearTimeout(timeout));
}

function normalizeThrownError(error) {
  if (error?.body?.error && error?.status) {
    return error;
  }

  if (error instanceof ZodError) {
    return makeError("VALIDATION_FAILED", "模型返回结构不符合要求。", 502, zodDetails(error));
  }

  if (error?.status === 429 || error?.code === "rate_limit_exceeded") {
    return makeError("RATE_LIMITED", "请求过快，请稍后再试。", 429);
  }

  if (error?.name === "AbortError") {
    return makeError("NETWORK_TIMEOUT", "联网查询超时，请稍后重试。", 504);
  }

  return makeError("OPENAI_REQUEST_FAILED", "联网资料补全失败，请稍后重试。", 502);
}

export function validateRequest(kind, body) {
  const route = ROUTES[kind];
  if (!route) {
    throw makeError("BAD_REQUEST", "未知的补全类型。", 400);
  }

  try {
    return route.requestSchema.parse(body);
  } catch (error) {
    throw makeError("BAD_REQUEST", "请求格式不正确。", 400, zodDetails(error));
  }
}

export async function enrich(kind, body, options = {}) {
  const route = ROUTES[kind];
  const env = options.env || process.env;
  const config = getRuntimeConfig(env);
  const input = validateRequest(kind, body);
  const client = options.openaiClient;

  if (!config.apiKey && !client) {
    throw makeError("MISSING_API_KEY", "服务端缺少 OPENAI_API_KEY，无法联网补全。", 500);
  }

  const activeClient = client || options.createClient?.(env);
  if (!activeClient?.responses?.create) {
    throw makeError("OPENAI_CLIENT_UNAVAILABLE", "OpenAI 客户端不可用。", 500);
  }

  const payload = {
    model: config.model,
    store: false,
    tools: [{ type: "web_search" }],
    input: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: route.promptBuilder(input)
      }
    ],
    text: {
      format: toStrictJsonSchema(route.responseSchema, route.jsonSchemaName)
    }
  };

  try {
    const response = await withTimeout(
      (signal) => activeClient.responses.create(payload, { signal }),
      config.timeoutMs
    );
    const parsed = parseResponsePayload(response);
    return route.responseSchema.parse(parsed);
  } catch (error) {
    throw normalizeThrownError(error);
  }
}

export function getRouteKinds() {
  return Object.keys(ROUTES);
}

