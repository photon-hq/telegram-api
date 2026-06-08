import type { ZodType } from "zod";
import { createClient } from "./generated/client";
import type {
  ResponseParameters,
  TelegramErrorResponse,
} from "./generated/types.gen";
import * as generatedSchemas from "./generated/zod.gen";

export type { Client } from "./generated/client";
// The entire operation-specific surface is generated. New Telegram methods and
// types appear here automatically on each codegen run with no edits to this file.
export * from "./generated/sdk.gen";
export type * from "./generated/types.gen";

/**
 * Generated Zod schemas for every Telegram type and method, exposed for manual
 * validation (e.g. of raw webhook payloads). Values are widened to `ZodType` so
 * the precise—but enormous—inferred types stay out of the published `.d.ts`;
 * cast `parse` results to the matching exported type (e.g. `Update`).
 *
 * Request and response validation is already wired into every SDK function, so
 * you only need these for validating data you receive elsewhere.
 *
 * @example
 * const update = schemas.zUpdate.parse(req.body) as Update;
 */
export const schemas: Record<string, ZodType> = generatedSchemas;

const DEFAULT_BASE_URL = "https://api.telegram.org";

/**
 * Error thrown when the Telegram Bot API rejects a request (`ok: false`).
 * Surfaced by `createTelegramClient` via a Hey API error interceptor.
 */
export class TelegramApiError extends Error {
  /** Telegram error code (mirrors the HTTP status, e.g. 400, 401, 403, 429). */
  readonly errorCode: number;
  /** Human-readable error description returned by Telegram. */
  readonly telegramDescription: string;
  /** Optional hints such as `retry_after` (rate limit) or `migrate_to_chat_id`. */
  readonly parameters?: ResponseParameters;

  constructor(response: TelegramErrorResponse) {
    super(response.description);
    this.name = "TelegramApiError";
    this.errorCode = response.error_code;
    this.telegramDescription = response.description;
    this.parameters = response.parameters;
  }
}

const isTelegramErrorResponse = (
  value: unknown
): value is TelegramErrorResponse => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "ok" in value &&
    value.ok === false &&
    "error_code" in value &&
    "description" in value
  );
};

export interface CreateTelegramClientOptions {
  /**
   * Override the API host, e.g. for a local Bot API server.
   * @default "https://api.telegram.org"
   */
  baseUrl?: string;
  /** Custom fetch implementation (defaults to `globalThis.fetch`). */
  fetch?: typeof fetch;
  /** Bot token obtained from @BotFather. Embedded into the request URL path. */
  token: string;
}

/**
 * Create a client bound to a single bot token. Pass the returned client to any
 * generated SDK function via `{ client }`. Successful responses are returned
 * directly (`{ ok: true, result }`); failures throw {@link TelegramApiError}.
 *
 * @example
 * const client = createTelegramClient({ token: process.env.BOT_TOKEN });
 * const { result } = await sendMessage({ client, body: { chat_id: 1, text: "hi" } });
 */
export const createTelegramClient = (options: CreateTelegramClientOptions) => {
  const root = options.baseUrl ?? DEFAULT_BASE_URL;
  const client = createClient({
    baseUrl: `${root}/bot${options.token}`,
    throwOnError: true,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  client.interceptors.error.use((error) =>
    isTelegramErrorResponse(error) ? new TelegramApiError(error) : error
  );

  return client;
};
