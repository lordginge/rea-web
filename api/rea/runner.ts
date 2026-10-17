import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import dns from "node:dns";

const execFileAsync = promisify(execFile);

export interface ReaAnalyzeOptions {
  screenshot: boolean;
  consoleText: boolean;
  storageKeys: boolean;
  scriptSources: boolean;
  jsonBodyShapes: boolean;
}

export interface ReaAnalyzeResult {
  page: Record<string, unknown> | null;
  screenshotBase64: string | null;
  evidenceIds: string[];
}

const PRIVATE_RANGES: Array<[bigint, bigint]> = [
  [ip4("127.0.0.0"), ip4("127.255.255.255")],
  [ip4("10.0.0.0"), ip4("10.255.255.255")],
  [ip4("172.16.0.0"), ip4("172.31.255.255")],
  [ip4("192.168.0.0"), ip4("192.168.255.255")],
  [ip4("169.254.0.0"), ip4("169.254.255.255")],
  [ip4("0.0.0.0"), ip4("0.255.255.255")],
  [ip4("100.64.0.0"), ip4("100.127.255.255")],
];

function ip4(s: string): bigint {
  const parts = s.split(".").map(Number);
  return (
    (BigInt(parts[0]) << 24n) |
    (BigInt(parts[1]) << 16n) |
    (BigInt(parts[2]) << 8n) |
    BigInt(parts[3])
  );
}

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".local")) {
    throw new Error("Localhost targets are not allowed");
  }
  const lookup = await dns.promises.lookup(host, { all: true }).catch(() => []);
  for (const addr of lookup) {
    if (addr.family === 4) {
      const v = ip4(addr.address);
      for (const [lo, hi] of PRIVATE_RANGES) {
        if (v >= lo && v <= hi) {
          throw new Error("Private or loopback addresses are not allowed");
        }
      }
    } else {
      const a = addr.address.toLowerCase();
      if (
        a === "::1" ||
        a.startsWith("fc") ||
        a.startsWith("fd") ||
        a.startsWith("fe80")
      ) {
        throw new Error("Private or loopback addresses are not allowed");
      }
    }
  }
  return url;
}

function reaBin(): string {
  // Resolve the locally installed rea-agents CLI through npx so it works in
  // dev and in the production bundle alike.
  return "npx";
}

function reaArgs(cmd: string, rest: string[]): string[] {
  return ["rea-agents", cmd, ...rest, "--json"];
}

async function runRea(
  cmd: string,
  rest: string[],
  timeoutMs = 120_000,
): Promise<Record<string, unknown>> {
  const { stdout } = await execFileAsync(
    reaBin(),
    reaArgs(cmd, rest),
    { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: process.env },
  );
  return JSON.parse(stdout) as Record<string, unknown>;
}

async function waitForEndpoint(endpoint: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${endpoint}/json/version`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Browser did not start in time");
}

async function openTab(endpoint: string, url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(
        `${endpoint}/json/new?${encodeURIComponent(url)}`,
        { method: "PUT" },
      );
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Could not open the target page");
}

async function findTargetId(
  endpoint: string,
  origin: string,
  timeoutMs = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const out = (await runRea("list-browser-targets", [endpoint])) as {
      normalized_result?: { targets?: Array<{ target_id?: string; origin?: string; url?: string }> };
    };
    const targets = out.normalized_result?.targets ?? [];
    const match =
      targets.find((t) => t.origin === origin) ??
      targets.find((t) => (t.url ?? "").startsWith(origin));
    if (match?.target_id) return match.target_id;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Page target did not appear in the browser");
}

function findChromium(): string {
  for (const c of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    return c; // resolved on PATH at spawn time
  }
  return "chromium";
}

export async function analyzeWebsite(
  url: URL,
  options: ReaAnalyzeOptions,
): Promise<ReaAnalyzeResult> {
  const port = 9300 + Math.floor(Math.random() * 500);
  const endpoint = `http://127.0.0.1:${port}`;
  const profileDir = await mkdtemp(path.join(tmpdir(), "rea-chrome-"));
  const origin = url.origin;

  const chrome = spawn(
    findChromium(),
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      "--window-size=1440,900",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const evidenceIds: string[] = [];
  let page: Record<string, unknown> | null = null;
  let screenshotBase64: string | null = null;

  try {
    await waitForEndpoint(endpoint);
    await openTab(endpoint, url.toString());
    // give the page a moment before first inspection
    await new Promise((r) => setTimeout(r, 2500));
    const targetId = await findTargetId(endpoint, origin);

    const inspectFlags: string[] = [
      "--observation-ms",
      "3000",
      "--include-json-body-shapes",
    ];
    if (options.jsonBodyShapes) inspectFlags.push("--include-websocket-shapes");
    if (options.consoleText) inspectFlags.push("--include-console-text");
    if (options.storageKeys) inspectFlags.push("--include-storage-keys");
    if (options.scriptSources) inspectFlags.push("--include-script-sources");

    const inspectOut = (await runRea("inspect-web-page", [
      endpoint,
      targetId,
      ...inspectFlags,
    ])) as { evidence_id?: string; normalized_result?: Record<string, unknown> };
    if (inspectOut.evidence_id) evidenceIds.push(inspectOut.evidence_id);
    page = inspectOut.normalized_result ?? null;

    if (options.screenshot) {
      try {
        const shotOut = (await runRea("capture-web-screenshot", [
          endpoint,
          targetId,
        ])) as {
          evidence_id?: string;
          normalized_result?: { artifact?: { data_base64?: string } };
        };
        if (shotOut.evidence_id) evidenceIds.push(shotOut.evidence_id);
        screenshotBase64 = shotOut.normalized_result?.artifact?.data_base64 ?? null;
      } catch {
        screenshotBase64 = null;
      }
    }
  } finally {
    chrome.kill("SIGKILL");
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }

  return { page, screenshotBase64, evidenceIds };
}
