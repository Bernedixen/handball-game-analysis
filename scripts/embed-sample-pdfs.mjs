import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const sampleDir = path.join(rootDir, "SamplePDFs");
const manifestPath = path.join(sampleDir, "manifest.json");
const outputPath = path.join(sampleDir, "embedded-samples.js");

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const bundles = await Promise.all((manifest.bundles ?? []).map(async (bundle) => ({
  ...bundle,
  files: await Promise.all((bundle.files ?? []).map(async (fileName) => {
    const filePath = path.join(sampleDir, bundle.folder, fileName);
    const data = await fs.readFile(filePath);
    return {
      name: fileName,
      data: data.toString("base64"),
    };
  })),
})));

await fs.writeFile(
  outputPath,
  `window.__EMBEDDED_SAMPLE_BUNDLES__ = ${JSON.stringify(bundles)};\n`,
  "utf8",
);

console.log(`Wrote ${outputPath}`);
