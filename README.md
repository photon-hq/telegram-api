# telegram-api

Centralized, auto-generated client libraries for the [Telegram Bot API](https://core.telegram.org/bots/api), built from the official documentation and published per language. **TypeScript is the only target today** ([`@photon-ai/telegram-ts`](./packages/telegram-ts)); the monorepo is structured so additional languages (`telegram-py`, `telegram-go`, …) can be added without restructuring.

## How it works

```
telegram.org docs ──(daily)──▶ specs/telegram-bot-api.openapi.json ──▶ codegen ──▶ build ──▶ npm
   @gramio/schema-parser           OpenAPI 3.0 (source of truth)      @hey-api/openapi-ts   tsdown   @photon-ai/telegram-ts
```

1. **Generate spec** — `scripts/generate-telegram-openapi.ts` scrapes the live docs via [`@gramio/schema-parser`](https://www.npmjs.com/package/@gramio/schema-parser) and writes a deterministic OpenAPI 3.0 document to [`specs/`](./specs). This is the committed source of truth shared by every language package.
2. **Detect change** — the daily [`update-telegram-openapi`](./.github/workflows/update-telegram-openapi.yaml) workflow regenerates the spec and opens a PR only when it changes, with an API-surface diff (added/removed methods & schemas, version bump) in the PR body.
3. **Generate code** — [`@hey-api/openapi-ts`](https://heyapi.dev) turns the spec into a typed SDK + Zod schemas (gitignored; built in CI). DX is achieved with native Hey API features — `responseStyle: 'data'`, `throwOnError`, and `validator: 'zod'` — wrapped by a tiny hand-written `createTelegramClient` factory.
4. **Publish** — on merge to `main`, [`release`](./.github/workflows/release.yaml) builds the package, computes the version, and publishes to npm via **Trusted Publishing (OIDC) + provenance** (no `NPM_TOKEN`), then tags + creates a GitHub Release.

## Versioning

The npm version mirrors the Telegram Bot API version: `${major}.${minor}.${patch}` where `major.minor` track the Bot API release and `patch` covers spec/tooling changes within the same version. See [`scripts/compute-version.ts`](./scripts/compute-version.ts).

## Local development

```sh
bun install
bun run generate:openapi   # refresh specs/ from telegram.org
bun run generate:client    # regenerate the TS client from the spec
bun run build              # tsdown → dual ESM/CJS + .d.ts
bun run typecheck
bun run test
bun run check              # ultracite (Biome) lint/format
bun run diff:surface       # preview the API-surface diff (uses git: BASE_REF, default origin/main)
bun run compute:version    # preview the next npm version
```

## One-time setup (before the first publish)

The release workflow publishes via **npm Trusted Publishing (OIDC)** — no `NPM_TOKEN`. New packages have a chicken-and-egg: a Trusted Publisher can only be attached to a package/scope that exists. Do this once:

1. **Create the `@photon-ai` org** on npm (npmjs.com → *Add organization*).
2. **Bootstrap the package** so a Trusted Publisher can be attached to it — either:
   - register an org-level Trusted Publisher if your npm plan supports it, **or**
   - run one manual first publish from a logged-in maintainer machine:
     ```sh
     cd packages/telegram-ts
     npm pkg set version=10.0.0
     bun run build
     npm publish --access public      # creates @photon-ai/telegram-ts@10.0.0
     ```
3. **Register the Trusted Publisher** on the package: npmjs.com → `@photon-ai/telegram-ts` → *Settings → Publishing access → Trusted Publisher* → GitHub Actions, repository `photon-hq/telegram-api`, workflow `release.yaml`. From here on, every release publishes tokenlessly with provenance.
4. (Optional) Set repo variable `AUTO_MERGE=true` to auto-merge additive-only spec updates so publishing is fully hands-off. Breaking changes (removed methods/schemas) always require manual review.

If you bootstrapped with a manual publish (step 2, second option), `10.0.0` is already live and the automation takes over on the next spec change — nothing else to run. If you used an org-level Trusted Publisher *without* a manual publish, re-run the release to cut `10.0.0`: `gh workflow run release.yaml --ref main`.

## Layout

| Path | Purpose |
| --- | --- |
| `specs/` | Committed OpenAPI source of truth |
| `scripts/` | Spec generation, version computation, surface diff |
| `packages/telegram-ts/` | The published `@photon-ai/telegram-ts` package |
| `.github/workflows/` | Daily spec update + release automation |
