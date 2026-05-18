#!/usr/bin/env bun
/**
 * End-to-end smoke test for the OpenBrains MCP surface.
 *
 * Two modes:
 *   - OB_SMOKE_MOCK=1: boots an in-process MCP server backed by an
 *     in-memory store + deterministic token-overlap scorer. No network.
 *   - Real: connects to OB_SERVER_URL with OB_ACCESS_TOKEN, identical to
 *     the production CLI client.
 *
 * Validates the Phase 1 step-9 success criterion: capture 10 distinct
 * thoughts, query each one back via paraphrase, top result must score
 * > 0.5. Also asserts memory_recall surfaces a trust grade of "evidence"
 * for each thought.
 */
import { readFileSync } from "node:fs";
import {
  type Credentials,
  credentialsPath,
  credentialsSchema,
} from "@openbrains/cli/credentials-store";
import { type McpClientLike, ObMcpClient } from "@openbrains/cli/mcp-client";
import { SMOKE_THOUGHTS } from "./fixtures/smoke-thoughts";
import { resolveSmokeEnv, type SmokeEnv } from "./lib/env";
import { startMockMcp } from "./lib/mock-server";

const SMOKE_SOURCE = "smoke";
const SIMILARITY_THRESHOLD = 0.5;

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function err(line: string): void {
  process.stderr.write(`${line}\n`);
}

interface StepResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail?: string;
}

interface SmokeRun {
  readonly client: McpClientLike;
  readonly close: () => Promise<void>;
}

function readCredentialsFile(): Credentials | null {
  try {
    const raw = readFileSync(credentialsPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return credentialsSchema.parse(parsed);
  } catch {
    return null;
  }
}

function buildRealClient(env: SmokeEnv): SmokeRun {
  const creds: Credentials = {
    server: env.serverUrl,
    accessToken: env.accessToken,
    expiresAt: Date.now() + 60 * 60 * 1000,
    userId: "smoke-runtime",
  };
  const client = new ObMcpClient({ credentials: creds });
  return {
    client,
    close: () => client.close(),
  };
}

async function buildClient(env: SmokeEnv): Promise<SmokeRun> {
  if (env.mock) {
    const handle = await startMockMcp();
    return { client: handle.client, close: handle.close };
  }
  return buildRealClient(env);
}

async function runStats(client: McpClientLike, verbose: boolean): Promise<StepResult> {
  try {
    const stats = await client.thoughtStats();
    if (verbose) {
      out(`     stats: ${JSON.stringify(stats)}`);
    }
    return { name: "thought_stats", passed: true, detail: `total=${stats.total}` };
  } catch (e) {
    return {
      name: "thought_stats",
      passed: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runCaptures(
  client: McpClientLike,
  verbose: boolean,
): Promise<{ steps: StepResult[]; ids: string[] }> {
  const steps: StepResult[] = [];
  const ids: string[] = [];
  for (let i = 0; i < SMOKE_THOUGHTS.length; i += 1) {
    const fixture = SMOKE_THOUGHTS[i];
    if (fixture === undefined) {
      continue;
    }
    const label = `capture[${i + 1}/${SMOKE_THOUGHTS.length}]`;
    try {
      const res = await client.captureThought({
        content: fixture.content,
        source: SMOKE_SOURCE,
      });
      ids.push(res.thoughtId);
      if (verbose) {
        out(`     ${label}: thoughtId=${res.thoughtId} duplicate=${res.duplicate}`);
      }
      steps.push({ name: label, passed: true, detail: res.thoughtId });
    } catch (e) {
      steps.push({
        name: label,
        passed: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { steps, ids };
}

interface SearchTopHit {
  readonly score: number;
  readonly content: string;
}

function assessSearchHit(
  label: string,
  expectedContent: string,
  top: SearchTopHit | undefined,
): StepResult {
  if (top === undefined) {
    return { name: label, passed: false, detail: "no results returned" };
  }
  if (top.content !== expectedContent) {
    return {
      name: label,
      passed: false,
      detail: `expected "${expectedContent.slice(0, 40)}…" got "${top.content.slice(0, 40)}…"`,
    };
  }
  if (top.score <= SIMILARITY_THRESHOLD) {
    return {
      name: label,
      passed: false,
      detail: `score ${top.score.toFixed(3)} not above threshold ${SIMILARITY_THRESHOLD}`,
    };
  }
  return { name: label, passed: true, detail: `score=${top.score.toFixed(3)}` };
}

async function runOneSearch(
  client: McpClientLike,
  verbose: boolean,
  index: number,
  expectedQuery: string,
  expectedContent: string,
): Promise<StepResult> {
  const label = `search[${index + 1}/${SMOKE_THOUGHTS.length}] "${expectedQuery}"`;
  try {
    const res = await client.searchThoughts({
      query: expectedQuery,
      limit: 5,
      threshold: SIMILARITY_THRESHOLD,
    });
    const top = res.results[0];
    if (verbose && top !== undefined) {
      out(`     top: score=${top.score.toFixed(3)} content="${top.content.slice(0, 60)}…"`);
    }
    return assessSearchHit(label, expectedContent, top);
  } catch (e) {
    return {
      name: label,
      passed: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runSearches(client: McpClientLike, verbose: boolean): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  for (let i = 0; i < SMOKE_THOUGHTS.length; i += 1) {
    const fixture = SMOKE_THOUGHTS[i];
    if (fixture === undefined) {
      continue;
    }
    steps.push(await runOneSearch(client, verbose, i, fixture.expectedQuery, fixture.content));
  }
  return steps;
}

async function runRecall(client: McpClientLike, verbose: boolean): Promise<StepResult> {
  const fixture = SMOKE_THOUGHTS[0];
  if (fixture === undefined) {
    return { name: "memory_recall", passed: false, detail: "no fixture[0]" };
  }
  const label = "memory_recall";
  try {
    const res = await client.memoryRecall({
      query: fixture.expectedQuery,
      limit: 3,
      threshold: SIMILARITY_THRESHOLD,
    });
    if (verbose) {
      out(`     recall: ${JSON.stringify(res)}`);
    }
    const top = res.results[0];
    if (top === undefined) {
      return { name: label, passed: false, detail: "no recall results" };
    }
    if (top.trustGrade !== "evidence") {
      return {
        name: label,
        passed: false,
        detail: `trustGrade=${top.trustGrade}, expected "evidence"`,
      };
    }
    if (top.origin === undefined) {
      return { name: label, passed: false, detail: "missing origin" };
    }
    return {
      name: label,
      passed: true,
      detail: `trustGrade=${top.trustGrade} origin=${top.origin}`,
    };
  } catch (e) {
    return { name: label, passed: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function reportStep(index: number, total: number, step: StepResult): void {
  const status = step.passed ? "ok" : "FAIL";
  const suffix = step.detail === undefined ? "" : ` — ${step.detail}`;
  out(`[${index}/${total}] ${step.name} ... ${status}${suffix}`);
}

function resolveEnvOrFail(): SmokeEnv | null {
  try {
    const fileCreds = readCredentialsFile();
    const augmented: Record<string, string | undefined> = { ...process.env };
    // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
    if (augmented["OB_ACCESS_TOKEN"] === undefined && fileCreds !== null) {
      // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
      augmented["OB_ACCESS_TOKEN"] = fileCreds.accessToken;
      // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
      if (augmented["OB_SERVER_URL"] === undefined) {
        // biome-ignore lint/complexity/useLiteralKeys: env access requires brackets under noPropertyAccessFromIndexSignature
        augmented["OB_SERVER_URL"] = fileCreds.server;
      }
    }
    return resolveSmokeEnv(augmented);
  } catch (e) {
    err(`env validation failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function reportSummary(steps: readonly StepResult[], startedAt: number): number {
  let passed = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step === undefined) {
      continue;
    }
    reportStep(i + 1, steps.length, step);
    if (step.passed) {
      passed += 1;
    }
  }
  const failed = steps.length - passed;
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  out("");
  out(`summary: ${passed}/${steps.length} passed, ${failed} failed in ${elapsed}s`);
  out("note: real-mode runs leave smoke fixtures behind (source=smoke); v1 has no delete tool.");
  return failed === 0 ? 0 : 1;
}

async function runAllSteps(env: SmokeEnv): Promise<StepResult[]> {
  const run = await buildClient(env);
  try {
    const steps: StepResult[] = [];
    const statsStep = await runStats(run.client, env.verbose);
    steps.push(statsStep);
    if (!statsStep.passed) {
      return steps;
    }
    const captures = await runCaptures(run.client, env.verbose);
    steps.push(...captures.steps);
    const searches = await runSearches(run.client, env.verbose);
    steps.push(...searches);
    steps.push(await runRecall(run.client, env.verbose));
    return steps;
  } finally {
    await run.close();
  }
}

async function main(): Promise<number> {
  const startedAt = Date.now();
  const envResolved = resolveEnvOrFail();
  if (envResolved === null) {
    return 1;
  }
  out(
    `openbrains smoke — mode=${envResolved.mock ? "MOCK" : "REAL"} server=${envResolved.serverUrl}`,
  );
  const steps = await runAllSteps(envResolved);
  return reportSummary(steps, startedAt);
}

const exitCode = await main();
process.exit(exitCode);
