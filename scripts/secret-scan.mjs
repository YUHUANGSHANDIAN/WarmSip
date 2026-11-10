import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";

const maxFileBytes = 2 * 1024 * 1024;
const rules = [
  {
    id: "openai-or-deepseek-key",
    regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: "google-api-key",
    regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  },
  {
    id: "github-token",
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  {
    id: "aws-access-key",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: "private-key",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    id: "assigned-service-secret",
    regex:
      /(?:\b(?:SERVICE_ACCESS_TOKEN|AI_CREDENTIAL_ENCRYPTION_KEY|AMAP_WEB_SERVICE_KEY|AMAP_JS_KEY|AMAP_SECURITY_CODE|AI_API_KEY|RENDER_API_KEY|GITHUB_TOKEN)\b[ \t]*[:=][ \t]*["']?)([A-Za-z0-9_./+=-]{20,})/g,
  },
  {
    id: "literal-bearer-token",
    regex: /Authorization\s*:\s*Bearer\s+([A-Za-z0-9._~+/-]{20,}=*)/gi,
  },
];

function fixtureValue(ruleId, path, value) {
  if (
    path.startsWith("tests/") &&
    (value.startsWith("sk-test-") ||
      value.includes("never-return-this-secret") ||
      value.includes("test-secret-value") ||
      value.includes("long-test-encryption-secret"))
  )
    return true;
  if (
    (path === ".github/workflows/ci.yml" ||
      path === "scripts/docker-smoke.sh") &&
    value.startsWith("warmsip-ci-")
  )
    return true;
  return false;
}

function matches(text, path) {
  const findings = [];
  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    let match;
    while ((match = rule.regex.exec(text))) {
      const value = match[1] || match[0];
      if (!fixtureValue(rule.id, path, value))
        findings.push({ rule: rule.id, path });
    }
  }
  return findings;
}

async function scanWorkingTree() {
  const paths = execFileSync("git", ["ls-files", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const findings = [];
  for (const path of paths) {
    const info = await stat(path).catch(() => undefined);
    if (!info?.isFile() || info.size > maxFileBytes) continue;
    const bytes = await readFile(path);
    if (bytes.includes(0)) continue;
    findings.push(...matches(bytes.toString("utf8"), path));
  }
  return findings;
}

function scanHistory() {
  const patch = execFileSync(
    "git",
    ["log", "--all", "--format=__COMMIT__%H", "-p", "--unified=0"],
    { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );
  const findings = [];
  let commit = "";
  let path = "";
  for (const line of patch.split(/\r?\n/)) {
    const commitMatch = /^__COMMIT__([0-9a-f]+)$/.exec(line);
    if (commitMatch) {
      commit = commitMatch[1];
      continue;
    }
    const pathMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (pathMatch) {
      path = pathMatch[1];
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    for (const finding of matches(line, path))
      findings.push({ ...finding, commit: commit.slice(0, 12) });
  }
  return findings;
}

const findings = [...(await scanWorkingTree()), ...scanHistory()];
const unique = new Map(
  findings.map((finding) => [
    `${finding.rule}:${finding.path}:${finding.commit || "worktree"}`,
    finding,
  ]),
);
if (unique.size) {
  console.error("Secret scan failed. Values are intentionally omitted.");
  for (const finding of unique.values())
    console.error(
      `${finding.rule}\t${finding.path}\t${finding.commit || "worktree"}`,
    );
  process.exit(1);
}
console.info(
  "Secret scan passed for the working tree and all reachable Git history.",
);
