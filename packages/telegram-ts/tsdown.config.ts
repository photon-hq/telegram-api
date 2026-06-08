import { defineConfig } from "tsdown";

// Bundles the hand-written surface + generated client into a dual ESM/CJS
// package with type declarations. `zod` is the only runtime dependency; the
// Hey API fetch client is bundled into the generated output.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  // `zod` is auto-externalized (it's a runtime dependency); the Hey API fetch
  // client is bundled into the generated output, so nothing else to externalize.
});
