import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const pkg = "io.github.yuhuangshandian.warmsip";
const output = "artifacts/android-evidence";
await mkdir(output, { recursive: true });
const adb = (...args) =>
  execFileSync("adb", args, { encoding: "utf8", timeout: 30000 });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function hierarchy() {
  adb("shell", "uiautomator", "dump", "/sdcard/warmsip-window.xml");
  return adb("shell", "cat", "/sdcard/warmsip-window.xml");
}
async function find(label, tap = false) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const xml = await hierarchy();
    const node = (xml.match(/<node\b[^>]*>/g) || []).find(
      (n) =>
        n.includes(`text="${label}"`) || n.includes(`content-desc="${label}"`),
    );
    if (node) {
      if (tap) {
        const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        if (!bounds) throw new Error(`No bounds: ${label}`);
        const [, x1, y1, x2, y2] = bounds.map(Number);
        adb(
          "shell",
          "input",
          "tap",
          String(Math.round((x1 + x2) / 2)),
          String(Math.round((y1 + y2) / 2)),
        );
      }
      return;
    }
    await delay(1000);
  }
  await writeFile(`${output}/failure.xml`, await hierarchy());
  throw new Error(`Android UI did not expose ${label}`);
}
try {
  adb("install", "-r", "android/app/build/outputs/apk/debug/app-debug.apk");
  adb("shell", "am", "start", "-n", `${pkg}/.MainActivity`);
  await find("暖迹地图", true);
  await find("创建新地图", true);
  await find("创建暖迹图", true);
  await find("我和 TA 的暖迹图");
  await writeFile(
    `${output}/created-map.png`,
    execFileSync("adb", ["exec-out", "screencap", "-p"]),
  );
  adb("shell", "am", "force-stop", pkg);
  adb("shell", "am", "start", "-n", `${pkg}/.MainActivity`);
  await find("暖迹地图", true);
  await find("我和 TA 的暖迹图");
  adb("shell", "input", "keyevent", "4");
  await writeFile(
    `${output}/restart.png`,
    execFileSync("adb", ["exec-out", "screencap", "-p"]),
  );
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        installed: true,
        launched: true,
        mapCreated: true,
        restartPersistence: true,
        device: adb("shell", "getprop", "ro.product.model").trim(),
        android: adb("shell", "getprop", "ro.build.version.release").trim(),
      },
      null,
      2,
    ),
  );
} finally {
  await writeFile(`${output}/logcat.txt`, adb("logcat", "-d", "-t", "1000"));
}
