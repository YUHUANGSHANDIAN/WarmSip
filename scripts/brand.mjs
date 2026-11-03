import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import sharp from "sharp";
const root = new URL("../", import.meta.url);
const path = (p) => new URL(p, root);
for (const directory of [
  "public/brand/",
  "src-tauri/icons/",
  "assets/brand/exports/",
])
  await mkdir(path(directory), { recursive: true });
const icon = (await readFile(path("assets/brand/icon.svg"), "utf8")).trim();
await copyFile(path("assets/brand/icon.svg"), path("assets/brand/logo.svg"));
await copyFile(path("assets/brand/icon.svg"), path("public/brand/icon.svg"));
await copyFile(path("assets/brand/icon.svg"), path("public/favicon.svg"));
await copyFile(
  path("assets/brand/warm-moment.svg"),
  path("public/brand/warm-moment.svg"),
);
const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="160" viewBox="0 0 760 160"><svg x="0" y="10" width="140" height="140" viewBox="0 0 512 512">${icon.split(">")[1]?.startsWith("<rect") ? "" : ""}${icon.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg><text x="175" y="84" fill="#6A4B3C" font-family="Arial,sans-serif" font-size="72" font-weight="700" letter-spacing="-3">WarmSip</text><text x="179" y="130" fill="#6A4B3C" font-family="Microsoft YaHei,sans-serif" font-size="23" letter-spacing="4">给 TA 点一杯温暖</text></svg>`;
await writeFile(path("assets/brand/wordmark.svg"), wordmark);
await writeFile(path("public/brand/wordmark.svg"), wordmark);
await writeFile(
  path("assets/brand/wordmark-dark.svg"),
  wordmark.replaceAll("#6A4B3C", "#FFF7F2"),
);
await writeFile(
  path("assets/brand/icon-monochrome.svg"),
  icon.replaceAll("#FF6B57", "#222222").replaceAll("#FFBFA7", "#222222"),
);
for (const size of [16, 32, 48, 64, 128, 192, 256, 512, 1024]) {
  const png = await sharp(Buffer.from(icon))
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(path(`assets/brand/exports/icon-${size}.png`), png);
  if ([128, 192, 512].includes(size))
    await writeFile(path(`public/brand/icon-${size}.png`), png);
}
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#FF6B57"/><svg x="64" y="64" width="384" height="384" viewBox="0 0 512 512">${icon.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg></svg>`;
await sharp(Buffer.from(maskable))
  .png()
  .toFile(
    path("public/brand/maskable-512.png").pathname.replace(/^\/([A-Z]:)/, "$1"),
  );
const sizes = [16, 32, 48, 64, 128, 256];
const pngs = await Promise.all(
  sizes.map((size) => readFile(path(`assets/brand/exports/icon-${size}.png`))),
);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const p = 6 + 16 * i;
  header[p] = sizes[i] === 256 ? 0 : sizes[i];
  header[p + 1] = header[p];
  header.writeUInt16LE(1, p + 4);
  header.writeUInt16LE(32, p + 6);
  header.writeUInt32LE(pngs[i].length, p + 8);
  header.writeUInt32LE(offset, p + 12);
  offset += pngs[i].length;
}
await writeFile(
  path("src-tauri/icons/icon.ico"),
  Buffer.concat([header, ...pngs]),
);
const chunks = [];
for (const [size, type] of [
  [16, "icp4"],
  [32, "icp5"],
  [64, "icp6"],
  [128, "ic07"],
  [256, "ic08"],
  [512, "ic09"],
  [1024, "ic10"],
]) {
  const png = await readFile(path(`assets/brand/exports/icon-${size}.png`));
  const h = Buffer.alloc(8);
  h.write(type);
  h.writeUInt32BE(png.length + 8, 4);
  chunks.push(h, png);
}
const icns = Buffer.alloc(8);
icns.write("icns");
icns.writeUInt32BE(8 + chunks.reduce((n, x) => n + x.length, 0), 4);
await writeFile(
  path("src-tauri/icons/icon.icns"),
  Buffer.concat([icns, ...chunks]),
);
for (const [size, name] of [
  [32, "32x32.png"],
  [128, "128x128.png"],
  [256, "128x128@2x.png"],
  [512, "icon.png"],
])
  await copyFile(
    path(`assets/brand/exports/icon-${size}.png`),
    path(`src-tauri/icons/${name}`),
  );
const art = (
  await readFile(path("assets/brand/warm-moment.svg"), "utf8")
).trim();
const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="640"><rect width="1600" height="640" rx="32" fill="#FFF0E4"/><text x="110" y="180" font-family="Arial,sans-serif" font-size="78" font-weight="700" fill="#6A4B3C">WarmSip</text><text x="113" y="255" font-family="Microsoft YaHei,sans-serif" font-size="36" fill="#6A4B3C">给 TA 点一杯温暖</text><text x="113" y="385" font-family="Microsoft YaHei,sans-serif" font-size="42" fill="#B93928">让每一份关心，都有温暖的落点。</text><text x="115" y="470" font-family="Arial,sans-serif" font-size="26" fill="#806454">Send a Little Warmth.</text><svg x="1010" y="20" width="560" height="600" viewBox="0 0 480 430">${art.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg></svg>`;
await writeFile(path("assets/brand/readme-banner.svg"), banner);
await writeFile(
  path("assets/brand/exports/readme-banner.png"),
  await sharp(Buffer.from(banner)).png().toBuffer(),
);
console.info("Original SVG masters and Web/desktop icon exports generated.");
