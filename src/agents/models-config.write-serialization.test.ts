import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveInstalledPluginIndexPolicyHash } from "../plugins/installed-plugin-index-policy.js";
import type { PluginMetadataSnapshot } from "../plugins/plugin-metadata-snapshot.js";
import { resolveDefaultAgentDir } from "./agent-scope.js";
import {
  CUSTOM_PROXY_MODELS_CONFIG,
  installModelsConfigTestHooks,
  withModelsTempHome,
} from "./models-config.e2e-harness.js";
import { readGeneratedModelsJson } from "./models-config.test-utils.js";

const planGreenchClawModelsJsonMock = vi.fn();
const writePrivateStoreTextWriteMock = vi.fn();
let actualPrivateFileStore:
  | typeof import("../infra/private-file-store.js").privateFileStore
  | undefined;

installModelsConfigTestHooks();

let ensureGreenchClawModelsJson: typeof import("./models-config.js").ensureGreenchClawModelsJson;
let clearCurrentPluginMetadataSnapshot: typeof import("../plugins/current-plugin-metadata-snapshot.js").clearCurrentPluginMetadataSnapshot;
let setCurrentPluginMetadataSnapshot: typeof import("../plugins/current-plugin-metadata-snapshot.js").setCurrentPluginMetadataSnapshot;

function createPluginMetadataSnapshot(workspaceDir: string): PluginMetadataSnapshot {
  const policyHash = resolveInstalledPluginIndexPolicyHash({});
  return {
    policyHash,
    workspaceDir,
    index: {
      version: 1,
      hostContractVersion: "test",
      compatRegistryVersion: "test",
      migrationVersion: 1,
      policyHash,
      generatedAtMs: 1,
      installRecords: {},
      plugins: [],
      diagnostics: [],
    },
    registryDiagnostics: [],
    manifestRegistry: { plugins: [], diagnostics: [] },
    plugins: [],
    diagnostics: [],
    byPluginId: new Map(),
    normalizePluginId: (pluginId) => pluginId,
    owners: {
      channels: new Map(),
      channelConfigs: new Map(),
      providers: new Map(),
      modelCatalogProviders: new Map(),
      cliBackends: new Map(),
      setupProviders: new Map(),
      commandAliases: new Map(),
      contracts: new Map(),
    },
    metrics: {
      registrySnapshotMs: 0,
      manifestRegistryMs: 0,
      ownerMapsMs: 0,
      totalMs: 0,
      indexPluginCount: 0,
      manifestPluginCount: 0,
    },
  };
}

async function expectMissingPath(operation: Promise<unknown>) {
  let error: NodeJS.ErrnoException | undefined;
  try {
    await operation;
  } catch (caught) {
    error = caught as NodeJS.ErrnoException;
  }
  expect(error?.code).toBe("ENOENT");
}

beforeAll(async () => {
  vi.doMock("./models-config.plan.js", () => ({
    planGreenchClawModelsJson: (...args: unknown[]) => planGreenchClawModelsJsonMock(...args),
  }));
  vi.doMock("../infra/private-file-store.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/private-file-store.js")>(
      "../infra/private-file-store.js",
    );
    actualPrivateFileStore = actual.privateFileStore;
    return {
      ...actual,
      privateFileStore: (rootDir: string) => {
        const store = actual.privateFileStore(rootDir);
        return {
          ...store,
          writeText: (relativePath: string, content: string | Uint8Array) =>
            writePrivateStoreTextWriteMock({
              rootDir,
              filePath: path.join(rootDir, relativePath),
              content,
            }),
        };
      },
    };
  });
  ({ ensureGreenchClawModelsJson } = await import("./models-config.js"));
  ({ clearCurrentPluginMetadataSnapshot, setCurrentPluginMetadataSnapshot } =
    await import("../plugins/current-plugin-metadata-snapshot.js"));
});

beforeEach(() => {
  clearCurrentPluginMetadataSnapshot();
  writePrivateStoreTextWriteMock
    .mockReset()
    .mockImplementation(
      async (params: { filePath: string; rootDir: string; content: string | Uint8Array }) => {
        if (!actualPrivateFileStore) {
          throw new Error("private file store mock not initialized");
        }
        return await actualPrivateFileStore(params.rootDir).writeText(
          path.basename(params.filePath),
          params.content,
        );
      },
    );
  planGreenchClawModelsJsonMock
    .mockReset()
    .mockImplementation(async (params: { cfg?: typeof CUSTOM_PROXY_MODELS_CONFIG }) => ({
      action: "write",
      contents: `${JSON.stringify({ providers: params.cfg?.models?.providers ?? {} }, null, 2)}\n`,
    }));
});

describe("models-config write serialization", () => {
  it("does not reuse default workspace plugin metadata for explicit agent dirs without workspace", async () => {
    await withModelsTempHome(async (home) => {
      const snapshot = createPluginMetadataSnapshot(path.join(home, "default-workspace"));
      setCurrentPluginMetadataSnapshot(snapshot, { config: {} });
      const agentDir = path.join(home, "agent-non-default");

      await ensureGreenchClawModelsJson({}, agentDir);

      const params = planGreenchClawModelsJsonMock.mock.calls.at(0)?.[0] as
        | { pluginMetadataSnapshot?: PluginMetadataSnapshot }
        | undefined;
      expect(params?.pluginMetadataSnapshot).not.toBe(snapshot);
    });
  });

  it("reuses current plugin metadata for explicit agent dirs with matching workspace", async () => {
    await withModelsTempHome(async (home) => {
      const workspaceDir = path.join(home, "agent-workspace");
      const snapshot = createPluginMetadataSnapshot(workspaceDir);
      setCurrentPluginMetadataSnapshot(snapshot, { config: {} });
      const agentDir = path.join(home, "agent-non-default");

      await ensureGreenchClawModelsJson({}, agentDir, { workspaceDir });

      const params = planGreenchClawModelsJsonMock.mock.calls.at(0)?.[0] as
        | { workspaceDir?: string; pluginMetadataSnapshot?: PluginMetadataSnapshot }
        | undefined;
      expect(params?.workspaceDir).toBe(workspaceDir);
      expect(params?.pluginMetadataSnapshot).toBe(snapshot);
    });
  });

  it("writes implicit models.json into the configured default agent dir", async () => {
    await withModelsTempHome(async (home) => {
      const cfg = {
        agents: {
          list: [{ id: "main" }, { id: "ops", default: true }],
        },
      };

      const result = await ensureGreenchClawModelsJson(cfg);

      expect(result.agentDir).toBe(path.join(home, ".GreenchClaw", "agents", "ops", "agent"));
      await expect(fs.access(path.join(result.agentDir, "models.json"))).resolves.toBeUndefined();
      await expectMissingPath(
        fs.access(path.join(home, ".GreenchClaw", "agents", "main", "agent", "models.json")),
      );
    });
  });

  it("does not reuse scoped startup discovery cache for a different provider scope", async () => {
    await withModelsTempHome(async (home) => {
      planGreenchClawModelsJsonMock.mockImplementation(async () => ({ action: "skip" }));
      const agentDir = path.join(home, "agent");
      await ensureGreenchClawModelsJson({}, agentDir, {
        providerDiscoveryProviderIds: ["openai"],
        providerDiscoveryTimeoutMs: 5000,
      });
      await ensureGreenchClawModelsJson({}, agentDir, {
        providerDiscoveryProviderIds: ["anthropic"],
        providerDiscoveryTimeoutMs: 5000,
      });

      expect(planGreenchClawModelsJsonMock).toHaveBeenCalledTimes(2);
      const params = planGreenchClawModelsJsonMock.mock.calls.at(1)?.[0] as
        | {
            providerDiscoveryProviderIds?: string[];
            providerDiscoveryTimeoutMs?: number;
          }
        | undefined;
      expect(params?.providerDiscoveryProviderIds).toEqual(["anthropic"]);
      expect(params?.providerDiscoveryTimeoutMs).toBe(5000);
    });
  });

  it("keeps the ready cache warm after models.json is written", async () => {
    await withModelsTempHome(async () => {
      await ensureGreenchClawModelsJson(CUSTOM_PROXY_MODELS_CONFIG);
      await ensureGreenchClawModelsJson(CUSTOM_PROXY_MODELS_CONFIG);

      expect(planGreenchClawModelsJsonMock).toHaveBeenCalledTimes(1);
    });
  });

  it("invalidates the ready cache when models.json changes externally", async () => {
    await withModelsTempHome(async () => {
      await ensureGreenchClawModelsJson(CUSTOM_PROXY_MODELS_CONFIG);
      await ensureGreenchClawModelsJson(CUSTOM_PROXY_MODELS_CONFIG);

      const modelPath = path.join(resolveDefaultAgentDir({}), "models.json");
      await fs.writeFile(modelPath, `${JSON.stringify({ external: true })}\n`, "utf8");
      const externalMtime = new Date(Date.now() + 2000);
      await fs.utimes(modelPath, externalMtime, externalMtime);
      await ensureGreenchClawModelsJson(CUSTOM_PROXY_MODELS_CONFIG);

      expect(planGreenchClawModelsJsonMock).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps distinct config fingerprints cached without evicting each other", async () => {
    await withModelsTempHome(async () => {
      planGreenchClawModelsJsonMock.mockImplementation(async () => ({ action: "noop" }));
      const first = structuredClone(CUSTOM_PROXY_MODELS_CONFIG);
      const second = structuredClone(CUSTOM_PROXY_MODELS_CONFIG);
      first.agents = { defaults: { model: "openai/gpt-5.4" } };
      second.agents = { defaults: { model: "anthropic/claude-sonnet-4-5" } };

      await ensureGreenchClawModelsJson(first);
      await ensureGreenchClawModelsJson(second);
      await ensureGreenchClawModelsJson(first);

      expect(planGreenchClawModelsJsonMock).toHaveBeenCalledTimes(2);
    });
  });

  it("serializes concurrent models.json writes to avoid overlap", async () => {
    await withModelsTempHome(async () => {
      const first = structuredClone(CUSTOM_PROXY_MODELS_CONFIG);
      const second = structuredClone(CUSTOM_PROXY_MODELS_CONFIG);
      const firstModel = first.models?.providers?.["custom-proxy"]?.models?.[0];
      const secondModel = second.models?.providers?.["custom-proxy"]?.models?.[0];
      if (!firstModel || !secondModel) {
        throw new Error("custom-proxy fixture missing expected model entries");
      }
      firstModel.name = "Proxy A";
      secondModel.name = "Proxy B with longer name";

      let inFlightWrites = 0;
      let maxInFlightWrites = 0;
      let markFirstModelsWriteStarted: () => void = () => {};
      const firstModelsWriteStarted = new Promise<void>((resolve) => {
        markFirstModelsWriteStarted = resolve;
      });
      let releaseModelsWrites: () => void = () => {};
      const modelsWritesCanContinue = new Promise<void>((resolve) => {
        releaseModelsWrites = resolve;
      });
      let modelsWriteCount = 0;
      writePrivateStoreTextWriteMock.mockImplementation(
        async (params: { filePath: string; rootDir: string; content: string | Uint8Array }) => {
          const isModelsWrite = path.basename(params.filePath) === "models.json";
          if (isModelsWrite) {
            modelsWriteCount += 1;
            inFlightWrites += 1;
            if (inFlightWrites > maxInFlightWrites) {
              maxInFlightWrites = inFlightWrites;
            }
            if (modelsWriteCount === 1) {
              markFirstModelsWriteStarted();
            }
            await modelsWritesCanContinue;
          }
          try {
            if (!actualPrivateFileStore) {
              throw new Error("private file store mock not initialized");
            }
            return await actualPrivateFileStore(params.rootDir).writeText(
              path.basename(params.filePath),
              params.content,
            );
          } finally {
            if (isModelsWrite) {
              inFlightWrites -= 1;
            }
          }
        },
      );

      const writes = Promise.all([
        ensureGreenchClawModelsJson(first),
        ensureGreenchClawModelsJson(second),
      ]);
      await firstModelsWriteStarted;
      await Promise.resolve();
      releaseModelsWrites();
      await writes;

      expect(maxInFlightWrites).toBe(1);
      const parsed = await readGeneratedModelsJson<{
        providers: { "custom-proxy"?: { models?: Array<{ name?: string }> } };
      }>();
      expect(["Proxy A", "Proxy B with longer name"]).toContain(
        parsed.providers["custom-proxy"]?.models?.[0]?.name,
      );
    });
  }, 60_000);
});
