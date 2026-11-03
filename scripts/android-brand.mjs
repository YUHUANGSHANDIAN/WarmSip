import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const svg = await readFile("assets/brand/icon.svg");
const root = "android/app/src/main/res";
for (const [density, scale] of [
  ["mdpi", 1],
  ["hdpi", 1.5],
  ["xhdpi", 2],
  ["xxhdpi", 3],
  ["xxxhdpi", 4],
]) {
  const dir = `${root}/mipmap-${density}`;
  await mkdir(dir, { recursive: true });
  for (const name of ["ic_launcher", "ic_launcher_round"])
    await sharp(svg)
      .resize(Math.round(48 * scale))
      .png()
      .toFile(`${dir}/${name}.png`);
  const foreground = await sharp(svg)
    .resize(Math.round(64 * scale))
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: Math.round(108 * scale),
      height: Math.round(108 * scale),
      channels: 4,
      background: "#ff6b57",
    },
  })
    .composite([{ input: foreground, gravity: "centre" }])
    .png()
    .toFile(`${dir}/ic_launcher_foreground.png`);
  for (const direction of ["port", "land"]) {
    const width = Math.round((direction === "port" ? 320 : 480) * scale),
      height = Math.round((direction === "port" ? 480 : 320) * scale);
    const path = `${root}/drawable-${direction}-${density}`;
    await mkdir(path, { recursive: true });
    await sharp({
      create: { width, height, channels: 4, background: "#fff7f2" },
    })
      .composite([
        {
          input: await sharp(svg)
            .resize(Math.round(96 * scale))
            .png()
            .toBuffer(),
          gravity: "centre",
        },
      ])
      .png()
      .toFile(`${path}/splash.png`);
  }
}
await sharp(svg).resize(256).png().toFile(`${root}/drawable/splash.png`);
await writeFile(
  `${root}/values/ic_launcher_background.xml`,
  '<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#FF6B57</color></resources>\n',
);
console.info("Generated original Android launcher icons and launch images.");
