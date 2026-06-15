import fs from "node:fs";
import path from "node:path";
import { resolveGreenchClawPackageRoot } from "../infra/GreenchClaw-root.js";

export const GREENCHCLAW_DOCS_URL = "https://docs.GreenchClaw.ai";
export const GREENCHCLAW_SOURCE_URL = "https://github.com/GreenchClaw/GreenchClaw";

type ResolveGreenchClawReferencePathParams = {
  workspaceDir?: string;
  argv1?: string;
  cwd?: string;
  moduleUrl?: string;
};

function isUsableDocsDir(docsDir: string): boolean {
  return fs.existsSync(path.join(docsDir, "docs.json"));
}

function isGitCheckout(rootDir: string): boolean {
  return fs.existsSync(path.join(rootDir, ".git"));
}

export async function resolveGreenchClawDocsPath(params: {
  workspaceDir?: string;
  argv1?: string;
  cwd?: string;
  moduleUrl?: string;
}): Promise<string | null> {
  const workspaceDir = params.workspaceDir?.trim();
  if (workspaceDir) {
    const workspaceDocs = path.join(workspaceDir, "docs");
    if (isUsableDocsDir(workspaceDocs)) {
      return workspaceDocs;
    }
  }

  const packageRoot = await resolveGreenchClawPackageRoot({
    cwd: params.cwd,
    argv1: params.argv1,
    moduleUrl: params.moduleUrl,
  });
  if (!packageRoot) {
    return null;
  }

  const packageDocs = path.join(packageRoot, "docs");
  return isUsableDocsDir(packageDocs) ? packageDocs : null;
}

export async function resolveGreenchClawSourcePath(
  params: ResolveGreenchClawReferencePathParams,
): Promise<string | null> {
  const packageRoot = await resolveGreenchClawPackageRoot({
    cwd: params.cwd,
    argv1: params.argv1,
    moduleUrl: params.moduleUrl,
  });
  if (!packageRoot || !isGitCheckout(packageRoot)) {
    return null;
  }
  return packageRoot;
}

export async function resolveGreenchClawReferencePaths(
  params: ResolveGreenchClawReferencePathParams,
): Promise<{
  docsPath: string | null;
  sourcePath: string | null;
}> {
  const [docsPath, sourcePath] = await Promise.all([
    resolveGreenchClawDocsPath(params),
    resolveGreenchClawSourcePath(params),
  ]);
  return { docsPath, sourcePath };
}
