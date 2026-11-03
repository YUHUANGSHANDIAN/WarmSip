import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const verify = args.includes("--verify");
const outputArg = args.find((a) => a.startsWith("--out="));
const output = resolve(root, outputArg ? outputArg.slice(6) : "SHA256SUMS");
const targets = args.filter((a) => a !== "--verify" && !a.startsWith("--out="));

async function filesAt(path) {
  const absolute = resolve(root, path);
  const info = await stat(absolute);
  if (info.isFile()) return [absolute];
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => filesAt(join(path, entry.name))),
  );
  return nested.flat().sort();
}

async function digest(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

if (verify) {
  const content = await readFile(output, "utf8");
  let failed = 0;
  for (const line of content.split(/\r?\n/).filter(Boolean)) {
    const [expected, ...parts] = line.trim().split(/\s+/);
    const name = parts.join(" ");
    const path = resolve(dirname(output), name);
    if (
      !/^[a-f0-9]{64}$/.test(expected) ||
      relative(dirname(output), path).startsWith("..")
    )
      throw new Error("校验清单路径无效");
    try {
      const actual = await digest(path);
      if (actual !== expected) {
        console.error(`校验失败: ${name}`);
        failed++;
      } else console.info(`已验证: ${name}`);
    } catch {
      console.error(`缺少产物: ${name}`);
      failed++;
    }
  }
  if (failed) process.exitCode = 1;
  else
    console.info(
      `SHA256SUMS 验证通过 (${content.split(/\r?\n/).filter(Boolean).length} 个文件)`,
    );
} else {
  const selected = targets.length
    ? targets
    : [
        "dist",
        "dist-server",
        "src-tauri/target/release/bundle",
        "android/app/build/outputs",
      ];
  const found = (
    await Promise.all(
      selected.map(async (target) => {
        try {
          return await filesAt(target);
        } catch {
          return [];
        }
      }),
    )
  )
    .flat()
    .filter((path) => !basename(path).startsWith("SHA256SUMS"))
    .sort();
  if (!found.length) throw new Error("没有找到可校验的构建产物，请先执行构建");
  const lines = [];
  for (const path of found) {
    const name = relative(dirname(output), path).replaceAll("\\", "/");
    lines.push(`${await digest(path)}  ${name}`);
  }
  await writeFile(output, `${lines.join("\n")}\n`, "utf8");
  console.info(`已生成 ${basename(output)} (${lines.length} 个文件)`);
}
