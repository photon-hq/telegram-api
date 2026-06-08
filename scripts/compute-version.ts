#!/usr/bin/env bun
import { appendFile } from "node:fs/promises";
import { join } from "node:path";

// Computes the next npm version for @photon-ai/telegram-ts by mirroring the
// Telegram Bot API version into semver: `${major}.${minor}.${patch}` where
// major.minor track the Bot API release and patch covers spec/tooling changes
// within the same Bot API version.
//
// Publishing is idempotent: `should_publish` is true only when the committed
// spec differs from the spec attached to the latest released git tag, so
// re-running the release workflow on an unchanged commit is a no-op.

const PACKAGE_NAME = "@photon-ai/telegram-ts";
const SPEC_PATH = join(
  import.meta.dir,
  "..",
  "specs",
  "telegram-bot-api.openapi.json"
);

const currentSpecText = await Bun.file(SPEC_PATH).text();
const currentSpec = JSON.parse(currentSpecText);
const telegramVersion = String(currentSpec.info.version); // e.g. "10.0"
const [major, minor] = telegramVersion.split(".");
const telegramPrefix = `${major}.${minor}`;

const getPublishedVersion = async (): Promise<string> => {
  const result = await Bun.$`npm view ${PACKAGE_NAME} version`
    .quiet()
    .nothrow();
  // A non-zero exit means the package (or this version) isn't published yet.
  return result.exitCode === 0 ? result.stdout.toString().trim() : "";
};

const specChangedSinceRelease = async (published: string): Promise<boolean> => {
  if (!published) {
    return true; // never published — always publish
  }
  const tag = `v${published}`;
  const result =
    await Bun.$`git show ${tag}:specs/telegram-bot-api.openapi.json`
      .quiet()
      .nothrow();
  if (result.exitCode !== 0) {
    return true; // tag or file missing — treat as changed
  }
  return result.stdout.toString() !== currentSpecText;
};

const computeNextVersion = (published: string): string => {
  if (!published) {
    return `${telegramPrefix}.0`;
  }
  const [publishedMajor, publishedMinor, publishedPatch] = published.split(".");
  if (`${publishedMajor}.${publishedMinor}` === telegramPrefix) {
    return `${telegramPrefix}.${Number(publishedPatch) + 1}`;
  }
  // Telegram bumped its major/minor — reset patch.
  return `${telegramPrefix}.0`;
};

const published = await getPublishedVersion();
const shouldPublish = await specChangedSinceRelease(published);
const version = computeNextVersion(published);

const output = [
  `version=${version}`,
  `should_publish=${shouldPublish}`,
  `telegram_version=${telegramVersion}`,
  `published_version=${published}`,
  "",
].join("\n");

process.stdout.write(output);

const githubOutput = process.env.GITHUB_OUTPUT;
if (githubOutput) {
  await appendFile(githubOutput, output);
}
