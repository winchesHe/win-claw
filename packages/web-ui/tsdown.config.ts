import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: "esm",
  outDir: "dist",
  dts: true,
  clean: true,
  hash: false,
});
