import { defineConfig } from "@hey-api/openapi-ts";

// Generates the Telegram Bot API client into `src/generated/` from the OpenAPI
// document produced by the root `generate:openapi` script. The public surface
// (`createTelegramClient`, error handling) lives in the hand-written `src/index.ts`;
// everything operation-specific below is fully generated and gitignored.
export default defineConfig({
  input: "../../specs/telegram-bot-api.openapi.json",
  output: {
    path: "src/generated",
    // tsdown + Biome own formatting/linting of the published bundle; keep
    // codegen output raw and deterministic (no prettier/eslint post-processing).
    postProcess: [],
  },
  plugins: [
    {
      name: "@hey-api/client-fetch",
      // Build-time default base URL (host only). The per-token base URL
      // (`.../bot<token>`) is set at runtime by `createTelegramClient`.
      runtimeConfigPath: "./src/hey-api.ts",
      // Telegram returns proper HTTP error codes; throw on them so the error
      // interceptor can surface a typed `TelegramApiError`.
      throwOnError: true,
    },
    "@hey-api/typescript",
    {
      name: "@hey-api/sdk",
      // Tree-shakeable standalone functions (one per Telegram method).
      operations: { strategy: "flat" },
      // Return the response body directly instead of the `{ data, error }` envelope.
      responseStyle: "data",
      // Validate request bodies and responses at runtime using the generated Zod schemas.
      validator: "zod",
    },
    "zod",
  ],
});
