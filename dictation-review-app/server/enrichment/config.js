export function getRuntimeConfig(env = process.env) {
  return {
    apiKey: env.OPENAI_API_KEY || "",
    model: env.OPENAI_MODEL || "gpt-5-mini",
    timeoutMs: Number(env.OPENAI_TIMEOUT_MS || 20000)
  };
}

