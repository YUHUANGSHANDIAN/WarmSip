import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const pkg = "io.github.yuhuangshandian.warmsip";
const output = "artifacts/android-evidence";
await mkdir(output, { recursive: true });
const adb = (...args) =>
  execFileSync("adb", args, { encoding: "utf8", timeout: 30000 });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Android WebView exposes page-level CDP, but it does not implement the browser
// context commands sent by Playwright's connectOverCDP. Talk to its page target.
class WebViewSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    socket.addEventListener("close", () => {
      for (const request of this.pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("Android WebView disconnected"));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(fn, ...args) {
    const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails)
      throw new Error(
        response.exceptionDetails.exception?.description ||
          response.exceptionDetails.text,
      );
    return response.result?.value;
  }

  async waitFor(fn, ...args) {
    for (let attempt = 0; attempt < 75; attempt++) {
      if (await this.evaluate(fn, ...args)) return;
      await delay(400);
    }
    throw new Error(`Android UI did not reach expected state: ${args.join(" ")}`);
  }

  close() {
    this.socket.close();
  }
}

async function connect() {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt++) {
    let socket;
    try {
      const pid = adb("shell", "pidof", pkg).trim();
      if (!/^\d+$/.test(pid)) throw new Error("Application process not ready");
      adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);
      const response = await fetch("http://127.0.0.1:9222/json/list", {
        signal: AbortSignal.timeout(2000),
      });
      const targets = await response.json();
      const target = targets.find(
        (item) =>
          item.type === "page" &&
          item.webSocketDebuggerUrl &&
          /^https:\/\/localhost\//.test(item.url),
      );
      if (!target) throw new Error("Android WebView page not ready");
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await Promise.race([
        new Promise((resolve, reject) => {
          socket.addEventListener("open", resolve, { once: true });
          socket.addEventListener("error", reject, { once: true });
        }),
        delay(2000).then(() => {
          throw new Error("Android WebView CDP connection timed out");
        }),
      ]);
      const session = new WebViewSession(socket);
      await session.send("Runtime.enable");
      await session.waitFor(() => document.readyState === "complete");
      await delay(3000);
      if (
        !(await session.evaluate(
          () => document.readyState === "complete" && !!document.querySelector("#root"),
        ))
      )
        throw new Error("Android WebView reloaded during startup");
      return session;
    } catch (error) {
      lastError = error;
      socket?.close();
      await delay(1000);
    }
  }
  throw lastError;
}

function clickText(selector, label) {
  const element = [...document.querySelectorAll(selector)].find(
    (item) => item.textContent.trim() === label,
  );
  if (!element) throw new Error(`Missing ${selector}: ${label}`);
  element.click();
}

function fillField(label, value) {
  const field = [...document.querySelectorAll("label.field")].find(
    (item) => item.querySelector("span")?.textContent.trim() === label,
  );
  const input = field?.querySelector("input,textarea");
  if (!input) throw new Error(`Missing field: ${label}`);
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

let session;
try {
  adb("install", "-r", "android/app/build/outputs/apk/debug/app-debug.apk");
  adb("shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`);
  session = await connect();
  console.info("Android WebView is stable; starting map flow");
  await session.waitFor(() => !!document.querySelector("a[href='#/maps']"));
  await session.evaluate(clickText, "a", "暖迹地图");
  await session.waitFor(() =>
    [...document.querySelectorAll("a")].some(
      (a) => a.textContent.trim() === "创建新地图",
    ),
  );
  await session.evaluate(clickText, "a", "创建新地图");
  await session.waitFor(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent.trim() === "创建暖迹图",
    ),
  );
  await session.evaluate(clickText, "button", "创建暖迹图");
  await session.waitFor(() =>
    [...document.querySelectorAll("h1")].some(
      (h) => h.textContent.trim() === "我和 TA 的暖迹图",
    ),
  );
  await session.evaluate(clickText, "a", "添加地点");
  await session.waitFor(() =>
    [...document.querySelectorAll("label.field > span")].some(
      (e) => e.textContent.trim() === "地点名称",
    ),
  );
  await session.evaluate(fillField, "地点名称", "Android 暖迹验收");
  await session.evaluate(
    fillField,
    "属于这个地点的小故事",
    "进程重启后保留照片与故事。",
  );

  // Feed an image through the real Android WebView's file input. The Android
  // system picker itself is outside this automated check and is not claimed.
  const image = (await readFile("public/brand/icon-192.png")).toString("base64");
  await session.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "icon.png", { type: "image/png" }));
    const input = document.querySelector('input[type="file"][aria-label="添加照片"]');
    if (!input) throw new Error("Missing photo input");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, image);
  await session.waitFor(
    () =>
      document.querySelectorAll('button[aria-label="移除此照片"]').length === 1,
  );
  await session.evaluate(clickText, "button", "保存地点与故事");
  await session.waitFor(() =>
    [...document.querySelectorAll("h3")].some(
      (h) => h.textContent.trim() === "Android 暖迹验收",
    ),
  );
  await writeFile(
    `${output}/created-map.png`,
    execFileSync("adb", ["exec-out", "screencap", "-p"]),
  );
  console.info("Map, place, and photo saved in Android WebView");

  session.close();
  session = undefined;
  adb("shell", "am", "force-stop", pkg);
  adb("shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`);
  session = await connect();
  console.info("Android process restarted; checking persisted records");
  await session.waitFor(() => !!document.querySelector("a[href='#/maps']"));
  await session.evaluate(clickText, "a", "暖迹地图");
  await session.waitFor(() => {
    const heading = [...document.querySelectorAll("a h3")].find(
      (h) => h.textContent.includes("我和 TA 的暖迹图"),
    );
    if (!heading) return false;
    heading.closest("a").click();
    return true;
  });
  await session.waitFor(() =>
    [...document.querySelectorAll("h3")].some(
      (h) => h.textContent.trim() === "Android 暖迹验收",
    ),
  );
  await session.evaluate(clickText, "a", "详情 / 编辑");
  await session.waitFor(
    () =>
      document.querySelectorAll('button[aria-label="移除此照片"]').length === 1,
  );
  const story = await session.evaluate(() =>
    [...document.querySelectorAll("label.field")]
      .find(
        (l) =>
          l.querySelector("span")?.textContent.trim() ===
          "属于这个地点的小故事",
      )
      ?.querySelector("textarea")?.value,
  );
  if (story !== "进程重启后保留照片与故事。")
    throw new Error("Android story was not restored after restart");
  console.info("Photo and story restored after Android process restart");
  console.info(
    "Before native Back:",
    JSON.stringify(
      await session.evaluate(() => ({
        hash: location.hash,
        history: history.state,
        active: document.activeElement?.tagName,
      })),
    ),
  );
  adb("shell", "input", "keyevent", "4");
  await delay(1000);
  console.info(
    "After native Back:",
    JSON.stringify(
      await session.evaluate(() => ({
        hash: location.hash,
        history: history.state,
        active: document.activeElement?.tagName,
      })),
    ),
  );
  await session.waitFor(() =>
    [...document.querySelectorAll("h1")].some(
      (h) => h.textContent.trim() === "我和 TA 的暖迹图",
    ),
  );
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
          "Installed debug APK / actual Android WebView over page-level CDP; image injected into file input, system picker not asserted",
        webView: await session.evaluate(() => navigator.userAgent),
        device: adb("shell", "getprop", "ro.product.model").trim(),
        android: adb("shell", "getprop", "ro.build.version.release").trim(),
      },
      null,
      2,
    ),
  );
  console.info("Android persistence and native back flow passed");
} catch (error) {
  try {
    await writeFile(
      `${output}/failure.png`,
      execFileSync("adb", ["exec-out", "screencap", "-p"]),
    );
  } catch {
    // Keep the original failure when the emulator itself is unavailable.
  }
  throw error;
} finally {
  session?.close();
  try {
    adb("forward", "--remove", "tcp:9222");
    await writeFile(`${output}/logcat.txt`, adb("logcat", "-d", "-t", "1000"));
  } catch {
    // The runner's job log already contains the primary error.
  }
}
