import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const preview = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "1421",
    "--strictPort",
  ],
  {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
preview.stdout.on("data", (chunk) => process.stdout.write(chunk));
preview.stderr.on("data", (chunk) => process.stderr.write(chunk));

async function waitForPreview() {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (preview.exitCode !== null)
      throw new Error(`Vite preview exited with ${preview.exitCode}`);
    try {
      const response = await fetch("http://127.0.0.1:1421", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Vite preview did not become ready");
}

function runPlaywright() {
  const cli = fileURLToPath(
    new URL("../node_modules/@playwright/test/cli.js", import.meta.url),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "test", ...process.argv.slice(2)], {
      cwd: root,
      stdio: "inherit",
      windowsHide: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Playwright exited on ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

let exitCode;
try {
  await waitForPreview();
  exitCode = await runPlaywright();
} finally {
  preview.kill();
  await Promise.race([
    new Promise((resolve) => preview.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}
process.exit(exitCode ?? 1);
