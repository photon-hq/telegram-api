import type { CreateClientConfig } from "./generated/client.gen";

// Build-time defaults for the generated Hey API client. The bot-token-specific
// base URL is applied at runtime by `createTelegramClient` in `index.ts`.
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: "https://api.telegram.org",
});
