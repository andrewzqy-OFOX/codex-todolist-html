import OpenAI from "openai";
import { getRuntimeConfig } from "./config.js";

export function createOpenAIClient(env = process.env) {
  const config = getRuntimeConfig(env);
  if (!config.apiKey) {
    return null;
  }
  return new OpenAI({ apiKey: config.apiKey });
}

