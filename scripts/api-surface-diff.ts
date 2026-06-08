#!/usr/bin/env bun
import { join } from "node:path";

// Emits a Markdown summary of how the regenerated OpenAPI spec changes the
// public API surface (methods, schemas, Telegram version) versus the baseline
// committed on the target branch. Used as the daily PR body and to gate
// auto-merge (additive-only changes are safe to merge automatically).

const SPEC_REL = "specs/telegram-bot-api.openapi.json";
const SPEC_PATH = join(import.meta.dir, "..", SPEC_REL);
const BASE_REF = process.env.BASE_REF ?? "origin/main";
const LEADING_SLASH = /^\//;

interface Spec {
  components?: { schemas?: Record<string, unknown> };
  info: { version: string };
  paths: Record<string, unknown>;
}

const methodsOf = (spec: Spec): string[] =>
  Object.keys(spec.paths).map((path) => path.replace(LEADING_SLASH, ""));

const schemasOf = (spec: Spec): string[] =>
  Object.keys(spec.components?.schemas ?? {});

const diff = (before: string[], after: string[]) => {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((name) => !beforeSet.has(name)).sort(),
    removed: before.filter((name) => !afterSet.has(name)).sort(),
  };
};

const loadBaseline = async (): Promise<Spec | null> => {
  const result = await Bun.$`git show ${BASE_REF}:${SPEC_REL}`
    .quiet()
    .nothrow();
  return result.exitCode === 0 ? JSON.parse(result.stdout.toString()) : null;
};

const list = (label: string, names: string[]): string =>
  names.length === 0
    ? ""
    : `\n${label}\n${names.map((name) => `- \`${name}\``).join("\n")}\n`;

const render = async (): Promise<string> => {
  const current: Spec = JSON.parse(await Bun.file(SPEC_PATH).text());
  const base = await loadBaseline();

  if (!base) {
    return `### Telegram Bot API \`${current.info.version}\`\n\nInitial spec — no baseline on \`${BASE_REF}\` to compare against.\n`;
  }

  const versionLine =
    base.info.version === current.info.version
      ? `**Telegram Bot API version:** unchanged at \`${current.info.version}\``
      : `**Telegram Bot API version:** \`${base.info.version}\` → \`${current.info.version}\` ⚠️`;

  const methods = diff(methodsOf(base), methodsOf(current));
  const schemas = diff(schemasOf(base), schemasOf(current));

  const noChanges =
    methods.added.length === 0 &&
    methods.removed.length === 0 &&
    schemas.added.length === 0 &&
    schemas.removed.length === 0 &&
    base.info.version === current.info.version;

  if (noChanges) {
    return `### Telegram Bot API surface\n\n${versionLine}\n\nNo method or schema names changed (only field-level edits, if any).\n`;
  }

  const breaking = methods.removed.length > 0 || schemas.removed.length > 0;

  return [
    "### Telegram Bot API surface changes",
    "",
    versionLine,
    "",
    `**Methods:** +${methods.added.length} / −${methods.removed.length}  ·  **Schemas:** +${schemas.added.length} / −${schemas.removed.length}`,
    list("**Added methods**", methods.added),
    list("**Removed methods**", methods.removed),
    list("**Added schemas**", schemas.added),
    list("**Removed schemas**", schemas.removed),
    "",
    breaking
      ? "> ⚠️ **Breaking:** methods or schemas were removed — review carefully before merging."
      : "> ✅ Additive-only change.",
    "",
  ].join("\n");
};

process.stdout.write(await render());
