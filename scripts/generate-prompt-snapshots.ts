import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format as formatWithOxfmt } from "oxfmt";
import {
  CODEX_RUNTIME_HAPPY_PATH_PROMPT_SNAPSHOT_DIR,
  createHappyPathPromptSnapshotFiles,
} from "../test/helpers/agents/happy-path-prompt-snapshots.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Formatting happens IN-PROCESS through the oxfmt Node binding.
//
// It used to spawn `node_modules/.bin/oxfmt` as a child process. On CI runners that spawn prints
// its first line and then never returns — the shard-level beforeAll burned 154s and died with an
// opaque "Hook timed out in 120000ms" (three runs in a row). The binding removes the child
// process from the equation entirely and turns a silent hang into a normal awaited call.
const FORMAT_TIMEOUT_MS = Number(process.env.GREENCHCLAW_OXFMT_TIMEOUT_MS ?? 25_000);

type PromptSnapshotFile = ReturnType<typeof createHappyPathPromptSnapshotFiles>[number];

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

async function writeSnapshotFiles(root: string, files: PromptSnapshotFile[]) {
  await Promise.all(
    files.map(async (file) => {
      const filePath = path.resolve(root, file.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content);
    }),
  );
}

async function formatSnapshotFiles(root: string, files: PromptSnapshotFile[]) {
  const targets = files.filter((file) => file.path.endsWith(".md") || file.path.endsWith(".json"));
  if (targets.length === 0) {
    return;
  }
  console.log(`[prompt-snapshots] formatting ${targets.length} file(s) with oxfmt (in-process)`);
  const startedAt = Date.now();
  for (const file of targets) {
    const filePath = path.resolve(root, file.path);
    const source = await fs.readFile(filePath, "utf8");
    const result = await withTimeout(
      formatWithOxfmt(filePath, source),
      FORMAT_TIMEOUT_MS,
      `oxfmt format of ${file.path}`,
    );
    const errors = result.errors.map((error) => error.message).filter(Boolean);
    if (errors.length > 0) {
      throw new Error(`oxfmt reported errors for ${file.path}:\n${errors.join("\n")}`);
    }
    if (result.code !== source) {
      await fs.writeFile(filePath, result.code);
    }
  }
  console.log(`[prompt-snapshots] oxfmt finished in ${Date.now() - startedAt}ms`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function readSnapshotFiles(root: string, files: PromptSnapshotFile[]) {
  return await Promise.all(
    files.map(async (file) => ({
      ...file,
      content: await fs.readFile(path.resolve(root, file.path), "utf8"),
    })),
  );
}

async function listCommittedSnapshotArtifactPaths(root: string): Promise<string[]> {
  let committedEntries: string[];
  try {
    committedEntries = await fs.readdir(
      path.resolve(root, CODEX_RUNTIME_HAPPY_PATH_PROMPT_SNAPSHOT_DIR),
    );
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) {
      throw error;
    }
    committedEntries = [];
  }
  return committedEntries
    .filter((entry) => entry.endsWith(".md") || entry.endsWith(".json"))
    .map((entry) => path.join(CODEX_RUNTIME_HAPPY_PATH_PROMPT_SNAPSHOT_DIR, entry));
}

export async function deleteStalePromptSnapshotFiles(
  root: string,
  files: Array<{ path: string }>,
): Promise<string[]> {
  const expectedPaths = new Set(files.map((file) => file.path));
  const stalePaths = (await listCommittedSnapshotArtifactPaths(root)).filter(
    (snapshotPath) => !expectedPaths.has(snapshotPath),
  );
  await Promise.all(stalePaths.map((snapshotPath) => fs.rm(path.resolve(root, snapshotPath))));
  return stalePaths;
}

export async function createFormattedPromptSnapshotFiles(): Promise<PromptSnapshotFile[]> {
  const files = createHappyPathPromptSnapshotFiles();
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "GreenchClaw-prompt-snapshots-"));
  try {
    await writeSnapshotFiles(tmpRoot, files);
    await formatSnapshotFiles(tmpRoot, files);
    return await readSnapshotFiles(tmpRoot, files);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}

async function writeSnapshots() {
  const files = await createFormattedPromptSnapshotFiles();
  await fs.mkdir(path.resolve(repoRoot, CODEX_RUNTIME_HAPPY_PATH_PROMPT_SNAPSHOT_DIR), {
    recursive: true,
  });
  const deleted = await deleteStalePromptSnapshotFiles(repoRoot, files);
  await writeSnapshotFiles(repoRoot, files);
  const deletedSummary = deleted.length > 0 ? ` Deleted ${deleted.length} stale file(s).` : "";
  console.log(`Wrote ${files.length} prompt snapshot files.${deletedSummary}`);
}

async function checkSnapshots() {
  const files = await createFormattedPromptSnapshotFiles();
  const expectedPaths = new Set(files.map((file) => file.path));
  const mismatches: string[] = [];
  for (const file of files) {
    const filePath = path.resolve(repoRoot, file.path);
    let actual: string;
    try {
      actual = await fs.readFile(filePath, "utf8");
    } catch (error) {
      mismatches.push(`${file.path}: missing (${describeError(error)})`);
      continue;
    }
    if (actual !== file.content) {
      mismatches.push(`${file.path}: differs from generated output`);
    }
  }
  for (const snapshotPath of await listCommittedSnapshotArtifactPaths(repoRoot)) {
    if (!expectedPaths.has(snapshotPath)) {
      mismatches.push(`${snapshotPath}: stale file (not generated)`);
    }
  }
  if (mismatches.length > 0) {
    console.error("Prompt snapshot drift detected. Run `pnpm prompt:snapshots:gen`.");
    for (const mismatch of mismatches) {
      console.error(`- ${mismatch}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Prompt snapshots are current (${files.length} files).`);
}

export async function runPromptSnapshotGenerator(argv = process.argv.slice(2)) {
  const mode = argv.includes("--write") ? "write" : argv.includes("--check") ? "check" : undefined;

  if (!mode) {
    console.error("Usage: pnpm prompt:snapshots:gen | pnpm prompt:snapshots:check");
    process.exitCode = 2;
    return;
  }

  if (mode === "write") {
    await writeSnapshots();
  } else {
    await checkSnapshots();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  await runPromptSnapshotGenerator();
}
