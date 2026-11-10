import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = resolve(root, "harmony/entry/src/main/resources/rawfile/web");
const dist = resolve(root, "dist");
try {
  await readFile(resolve(dist, "index.html"));
} catch {
  console.error("HarmonyOS 同步需要先执行 npm run build");
  process.exitCode = 1;
  process.exit();
}
await mkdir(web, { recursive: true });
await cp(dist, web, { recursive: true, force: false, errorOnExist: true });
const manifest = {
  version: "0.2.0-beta.4",
  generatedAt: new Date().toISOString(),
  source: "dist",
  note: "ArkWeb 只加载本地应用壳；地图资源按需走服务端代理，不写入离线缓存。",
};
await writeFile(
  resolve(root, "harmony/sync-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.info(
  "Web 资源已复制。此目录是未编译的适配源码；需要官方 DevEco 工程模板、SDK 与签名才能构建 HAP。重复同步遇到已有文件时停止，不覆盖文件。",
);
