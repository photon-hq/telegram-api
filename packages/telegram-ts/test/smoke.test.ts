import { describe, expect, it } from "bun:test";
import {
  createTelegramClient,
  getMe,
  schemas,
  sendMessage,
  TelegramApiError,
} from "../src/index.ts";

type MockFetch = typeof fetch;

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("createTelegramClient", () => {
  it("embeds the token in the URL path and unwraps a successful result", async () => {
    let calledUrl = "";
    const mockFetch: MockFetch = (input) => {
      calledUrl = input instanceof Request ? input.url : String(input);
      return Promise.resolve(
        jsonResponse(
          {
            ok: true,
            result: { id: 42, is_bot: true, first_name: "Test Bot" },
          },
          200
        )
      );
    };

    const client = createTelegramClient({ token: "123:ABC", fetch: mockFetch });
    const response = await getMe({ client });

    expect(calledUrl).toBe("https://api.telegram.org/bot123:ABC/getMe");
    expect(response.result.id).toBe(42);
    expect(response.result.first_name).toBe("Test Bot");
  });

  it("throws a typed TelegramApiError when Telegram responds ok:false", async () => {
    const mockFetch: MockFetch = () =>
      Promise.resolve(
        jsonResponse(
          {
            ok: false,
            error_code: 429,
            description: "Too Many Requests: retry after 5",
            parameters: { retry_after: 5 },
          },
          429
        )
      );

    const client = createTelegramClient({ token: "123:ABC", fetch: mockFetch });

    const call = sendMessage({ client, body: { chat_id: 1, text: "hi" } });
    await expect(call).rejects.toBeInstanceOf(TelegramApiError);
    await expect(call).rejects.toMatchObject({
      errorCode: 429,
      parameters: { retry_after: 5 },
    });
  });
});

describe("schemas", () => {
  it("exposes generated Zod schemas for manual validation", () => {
    const update = schemas.zUpdate?.parse({ update_id: 7 });
    expect(update).toMatchObject({ update_id: 7 });
  });
});
