// Isolated UI test workspace. Never loads .env or payment/AI credentials.
import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
await mkdir("data", { recursive: true });
process.env.DATA_DIR = await mkdtemp(resolve("data", "ui-test-"));
process.env.PORT = "4320";
process.env.PAYPAL_ENV = "demo";
for (const key of [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "GEMINI_API_KEY",
  "ELASTICSEARCH_URL",
  "ELASTICSEARCH_API_KEY",
  "PUBLIC_URL",
])
  process.env[key] = "";
await import("../server.mjs");
