import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const pkg = "io.github.yuhuangshandian.warmsip";
const output = "artifacts/android-evidence";
await mkdir(output, { recursive: true });
const adb = (...args) =>
  execFileSync("adb", args, { encoding: "utf8", timeout: 30000 });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect() {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const pid = adb("shell", "pidof", pkg).trim();
      if (!/^\d+$/.test(pid)) throw new Error("Application process not ready");
      adb(
        "forward",
        "tcp:9222",
        `localabstract:webview_devtools_remote_${pid}`,
      );
      const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", {
        timeout: 2000,
      });
      const page = browser.contexts()[0]?.pages()[0];
      if (!page) {
        await browser.close();
        throw new Error("WebView page not ready");
      }
      page.setDefaultTimeout(20000);
      return { browser, page };
    } catch (error) {
      lastError = error;
    }
    await delay(1000);
  }
  throw lastError;
}
let connection;
try {
  adb("install", "-r", "android/app/build/outputs/apk/debug/app-debug.apk");
  adb("shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`);
  connection = await connect();
  let page = connection.page;
  await page.getByRole("link", { name: "暖迹地图", exact: true }).click();
  await page.getByRole("link", { name: "创建新地图", exact: true }).click();
  await page.getByRole("button", { name: "创建暖迹图", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "我和 TA 的暖迹图", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "添加地点", exact: true })
    .first()
    .click();
  await page.getByLabel("地点名称").fill("Android 暖迹验收");
  await page
    .getByLabel("属于这个地点的小故事")
    .fill("进程重启后保留照片与故事。");
  await page
    .getByLabel("添加照片", { exact: true })
    .setInputFiles({
      name: "icon.png",
      mimeType: "image/png",
      buffer: await readFile("public/brand/icon-192.png"),
    });
  await expect(page.getByRole("button", { name: "移除此照片" })).toHaveCount(1);
  await page
    .getByRole("button", { name: "保存地点与故事", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Android 暖迹验收", exact: true }),
  ).toBeVisible();
  await writeFile(
    `${output}/created-map.png`,
    execFileSync("adb", ["exec-out", "screencap", "-p"]),
  );
  await connection.browser.close();
  connection = undefined;
  adb("shell", "am", "force-stop", pkg);
  adb("shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`);
  connection = await connect();
  page = connection.page;
  await page.getByRole("link", { name: "暖迹地图", exact: true }).click();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: "我和 TA 的暖迹图", exact: true }),
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Android 暖迹验收", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "详情 / 编辑", exact: true }).click();
  await expect(page.getByRole("button", { name: "移除此照片" })).toHaveCount(1);
  await expect(page.getByLabel("属于这个地点的小故事")).toHaveValue(
    "进程重启后保留照片与故事。",
  );
  adb("shell", "input", "keyevent", "4");
  await expect(
    page.getByRole("heading", { name: "我和 TA 的暖迹图", exact: true }),
  ).toBeVisible();
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
        photoRestored: true,
        nativeBack: true,
        automation:
          "Installed debug APK / actual Android WebView over ADB CDP; image injected into file input, system picker not asserted",
        webView: await page.evaluate(() => navigator.userAgent),
        device: adb("shell", "getprop", "ro.product.model").trim(),
        android: adb("shell", "getprop", "ro.build.version.release").trim(),
      },
      null,
      2,
    ),
  );
} catch (error) {
  await writeFile(
    `${output}/failure.png`,
    execFileSync("adb", ["exec-out", "screencap", "-p"]),
  );
  throw error;
} finally {
  await connection?.browser.close();
  adb("forward", "--remove", "tcp:9222");
  await writeFile(`${output}/logcat.txt`, adb("logcat", "-d", "-t", "1000"));
}
