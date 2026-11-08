import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  copyFile,
} from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { zipSync } from "fflate";

const [kind, selectedPlatform, target] = process.argv.slice(2);
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const platform = kind === "desktop" ? selectedPlatform : kind;
const artifactRoot = process.env.WARMSIP_ARTIFACT_ROOT || "artifacts";
if (
  ![
    "web",
    "android",
    "windows-x64",
    "linux-x64",
    "macos-arm64",
    "macos-x64",
  ].includes(platform)
)
  throw new Error("Unsupported package platform");
const output = join(artifactRoot, platform);
await mkdir(output, { recursive: true });
async function walk(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(child)));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}
async function zip(name, roots) {
  const files = {};
  for (const [path, prefix] of roots) {
    for (const file of await walk(path))
      files[join(prefix, relative(path, file)).replaceAll("\\", "/")] =
        new Uint8Array(await readFile(file));
  }
  if (name.includes("server"))
    for (const path of [
      "Dockerfile",
      "compose.yaml",
      ".dockerignore",
      ".env.example",
      "package.json",
      "package-lock.json",
      "tsconfig.server.json",
    ])
      files[path] = new Uint8Array(await readFile(path));
  await writeFile(join(output, name), zipSync(files, { level: 6 }));
}
if (kind === "web") {
  await zip(`WarmSip_${version}_web-pwa.zip`, [
    ["dist", "web"],
    ["docs", "docs"],
  ]);
  await zip(`WarmSip_${version}_server.zip`, [
    ["dist-server", "dist-server"],
    ["server", "server"],
    ["shared", "shared"],
    ["docs", "docs"],
  ]);
} else if (kind === "android") {
  await copyFile(
    "android/app/build/outputs/apk/debug/app-debug.apk",
    join(output, `WarmSip_${version}_android-debug.apk`),
  );
} else {
  const extensions = platform.startsWith("windows")
    ? [".exe"]
    : platform.startsWith("linux")
      ? [".AppImage", ".deb"]
      : [".dmg"];
  const files = (await walk(target)).filter(
    (p) =>
      basename(p).includes(version) &&
      extensions.some((e) => p.endsWith(e)),
  );
  for (const extension of extensions) {
    const found = files.filter((p) => p.endsWith(extension));
    if (found.length !== 1)
      throw new Error(
        `Expected one ${extension} artifact, found ${found.length}`,
      );
    await copyFile(
      found[0],
      join(output, `WarmSip_${version}_${platform}${extension}`),
    );
  }
}
const sha =
  process.env.GITHUB_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
await writeFile(
  join(output, `build-${platform}.json`),
  JSON.stringify(
    {
      version,
      commit: sha,
      platform,
      builtAt: new Date().toISOString(),
      runner: process.env.WARMSIP_BUILD_RUNNER || process.platform,
      compiled: true,
      signature:
        platform === "android"
          ? "Android debug"
          : platform.startsWith("macos")
            ? "ad-hoc; not notarized"
            : "unsigned",
      nativeCoreValidation:
        "See CI native smoke logs and docs/VALIDATION.md; compilation alone is not functional verification.",
      files: (await readdir(output))
        .filter((p) => !p.startsWith("SHA256SUMS"))
        .map((name) => basename(name)),
    },
    null,
    2,
  ) + "\n",
);
console.info(`Packaged ${platform} ${version} from ${sha}`);
