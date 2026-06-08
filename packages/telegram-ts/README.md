# @photon-ai/telegram-ts

Typed TypeScript client and [Zod](https://zod.dev) schemas for the [Telegram Bot API](https://core.telegram.org/bots/api), generated daily from the official documentation.

- **Fully typed** — every method, request, and response is generated from the live spec.
- **Runtime-validated** — request bodies and responses are checked against Zod schemas automatically.
- **Tree-shakeable** — import only the methods you use.
- **Universal** — runs on Node 18+, Bun, Deno, Cloudflare Workers, and browsers (the fetch client is bundled; `zod` is the only runtime dependency).
- **Versioned to Telegram** — the package version mirrors the Bot API version (e.g. `10.0.x` ⇒ Bot API 10.0).

## Install

```sh
npm install @photon-ai/telegram-ts zod
# or: bun add @photon-ai/telegram-ts zod
```

## Usage

Create a client bound to your bot token, then pass it to any method:

```ts
import { createTelegramClient, sendMessage, getMe } from "@photon-ai/telegram-ts";

const client = createTelegramClient({ token: process.env.BOT_TOKEN! });

const me = await getMe({ client });
console.log(me.result.username);

const sent = await sendMessage({
  client,
  body: { chat_id: 123456789, text: "Hello from @photon-ai/telegram-ts" },
});
console.log(sent.result.message_id);
```

Successful responses are returned directly as `{ ok: true, result }` — read `.result` for the typed payload.

### Error handling

When Telegram rejects a request (`ok: false`), the call throws a typed `TelegramApiError`:

```ts
import { TelegramApiError, sendMessage } from "@photon-ai/telegram-ts";

try {
  await sendMessage({ client, body: { chat_id: 1, text: "hi" } });
} catch (error) {
  if (error instanceof TelegramApiError) {
    console.error(error.errorCode, error.telegramDescription);
    if (error.parameters?.retry_after) {
      // rate limited — back off for error.parameters.retry_after seconds
    }
  }
}
```

### Validating untrusted input

Request and response validation is already wired into every method. For data you receive elsewhere (e.g. raw webhook payloads), the generated Zod schemas are exposed under `schemas`:

```ts
import { schemas, type Update } from "@photon-ai/telegram-ts";

app.post("/webhook", (req, res) => {
  const update = schemas.zUpdate.parse(req.body) as Update;
  // ...handle the validated update
});
```

### Self-hosted Bot API server

```ts
const client = createTelegramClient({
  token: process.env.BOT_TOKEN!,
  baseUrl: "https://bot-api.internal.example.com",
});
```

### Custom fetch

```ts
const client = createTelegramClient({
  token: process.env.BOT_TOKEN!,
  fetch: myInstrumentedFetch,
});
```

## Versioning

The package version mirrors the Telegram Bot API version: `MAJOR.MINOR` track the Bot API release, and `PATCH` covers regeneration and tooling fixes within the same Bot API version. Installing `@photon-ai/telegram-ts@10` gives you Bot API 10.x.

## License

MIT
