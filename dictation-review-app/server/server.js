import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { enrich } from "./enrichment/enrichment-service.js";
import { createOpenAIClient } from "./enrichment/openai-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
const envPath = path.join(__dirname, "..", ".env");

dotenv.config({ path: envPath, quiet: true });

export function createRateLimiter({ windowMs = 60_000, maxRequests = 30 } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "local";
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > maxRequests) {
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "请求过快，请稍后再试。",
          details: []
        }
      });
      return;
    }

    next();
  };
}

function sendSafeError(res, error) {
  const status = error?.status || 500;
  const safeError = error?.body?.error || {
    code: "INTERNAL_ERROR",
    message: "服务器处理失败，请稍后重试。",
    details: []
  };

  res.status(status).json({
    success: false,
    error: {
      code: safeError.code,
      message: safeError.message,
      details: Array.isArray(safeError.details) ? safeError.details : []
    }
  });
}

export function createApp(options = {}) {
  const app = express();
  const env = options.env || process.env;
  const openaiClient = options.openaiClient || createOpenAIClient(env);
  const rateLimiter = options.rateLimiter || createRateLimiter();

  app.use(express.json({ limit: "16kb" }));
  app.use(express.static(publicDir));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      app: "dictation-review-app",
      phase: "backend-enrichment",
      openaiConfigured: Boolean(env.OPENAI_API_KEY),
      modelConfigured: Boolean(env.OPENAI_MODEL)
    });
  });

  const registerEnrichmentRoute = (pathName, kind) => {
    app.post(pathName, rateLimiter, async (req, res) => {
      try {
        const result = await enrich(kind, req.body, {
          env,
          openaiClient,
          createClient: createOpenAIClient
        });
        res.json(result);
      } catch (error) {
        sendSafeError(res, error);
      }
    });
  };

  registerEnrichmentRoute("/api/enrich/english", "english");
  registerEnrichmentRoute("/api/enrich/chinese", "chinese");
  registerEnrichmentRoute("/api/enrich/poem", "poem");
  registerEnrichmentRoute("/api/enrich/character", "character");

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "The requested route does not exist.",
        details: []
      }
    });
  });

  return app;
}

const app = createApp();
const port = process.env.PORT || 3000;
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  app.listen(port, () => {
    console.log(`Dictation Review App running at http://localhost:${port}`);
  });
}

export { app };
