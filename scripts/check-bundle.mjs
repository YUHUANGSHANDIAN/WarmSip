import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const assets = join("dist", "assets");
const files = await readdir(assets);
const javascript = files.filter((file) => file.endsWith(".js"));
const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
];
let total = 0;
let largest = { file: "", bytes: 0 };
for (const file of javascript) {
  const bytes = (await stat(join(assets, file))).size;
  total += bytes;
  if (bytes > largest.bytes) largest = { file, bytes };
  const source = await readFile(join(assets, file), "utf8");
  if (
    source.includes("@earendil-works/pi-ai") ||
    source.includes("AWS_ACCESS_KEY_ID") ||
    source.includes("OPENROUTER_API_KEY")
  )
    throw new Error(
      `Server-only AI runtime leaked into client bundle: ${file}`,
    );
  if (secretPatterns.some((pattern) => pattern.test(source)))
    throw new Error(
      `A credential-like value leaked into client bundle: ${file}`,
    );
}
if (largest.bytes > 850 * 1024)
  throw new Error(
    `Largest client chunk ${largest.file} is ${largest.bytes} bytes; budget is 870400`,
  );
console.info(
  JSON.stringify({
    javascriptFiles: javascript.length,
    totalBytes: total,
    largest,
    result: "bundle within budget and server-only AI SDK absent",
  }),
);
