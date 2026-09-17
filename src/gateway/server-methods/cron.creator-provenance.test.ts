import { describe, expect, it, vi } from "vitest";
import type { CronJob, CronJobCreate } from "../../cron/types.js";
import type { GatewayClient } from "../server-methods/types.js";
import { cronHandlers } from "./cron.js";
import type { RespondFn } from "./types.js";

type CronAddHandlerParams = Parameters<(typeof cronHandlers)["cron.add"]>[0];

function createBaseJobParams(): Record<string, unknown> {
  return {
    name: "test-job",
    schedule: { kind: "every", everyMs: 60_000 },
    sessionTarget: "isolated",
    wakeMode: "next-heartbeat",
    payload: { kind: "systemEvent", text: "hello" },
  };
}

function createClient(overrides?: {
  clientId?: string;
  mode?: string;
  connId?: string;
}): GatewayClient {
  return {
    connect: {
      minProtocol: 1,
      maxProtocol: 1,
      client: {
        id: (overrides?.clientId ?? "cli") as never,
        version: "1.0.0",
        platform: "test",
        mode: (overrides?.mode ?? "cli") as never,
      },
    },
    connId: overrides?.connId ?? "conn-1",
  } as GatewayClient;
}

function captureRespond() {
  const calls: Parameters<RespondFn>[] = [];
  const respond: RespondFn = (...args) => {
    calls.push(args);
  };
  return { calls, respond };
}

function createContext(captured: { jobCreate?: CronJobCreate }) {
  return {
    getRuntimeConfig: () => ({}) as never,
    cron: {
      add: vi.fn(async (jobCreate: CronJobCreate) => {
        captured.jobCreate = jobCreate;
        return {
          ...jobCreate,
          id: "job-1",
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          state: {},
        } as CronJob;
      }),
      getDefaultAgentId: () => undefined,
      getJob: () => undefined,
    },
    logGateway: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as CronAddHandlerParams["context"];
}

async function invokeCronAdd(params: {
  jobParams?: Record<string, unknown>;
  client?: GatewayClient | null;
}): Promise<{
  respondCalls: Parameters<RespondFn>[];
  jobCreate?: CronJobCreate;
  context: CronAddHandlerParams["context"];
}> {
  const captured: { jobCreate?: CronJobCreate } = {};
  const context = createContext(captured);
  const { calls, respond } = captureRespond();
  await cronHandlers["cron.add"]({
    req: { id: 1, method: "cron.add", params: params.jobParams ?? createBaseJobParams() } as never,
    params: (params.jobParams ?? createBaseJobParams()) as Record<string, unknown>,
    client: params.client === undefined ? createClient() : params.client,
    isWebchatConnect: () => false,
    respond,
    context,
  });
  return { respondCalls: calls, jobCreate: captured.jobCreate, context };
}

describe("cron.add creator provenance", () => {
  it("stamps cli provenance for a CLI client", async () => {
    const { respondCalls, jobCreate } = await invokeCronAdd({
      client: createClient({ clientId: "cli", mode: "cli" }),
    });
    expect(respondCalls[0]?.[0]).toBe(true);
    expect(jobCreate?.createdBy).toEqual({ kind: "cli", id: "cli" });
  });

  it("stamps ui provenance for webchat/control-ui clients", async () => {
    for (const clientId of ["webchat-ui", "GreenchClaw-control-ui"]) {
      const { jobCreate } = await invokeCronAdd({
        client: createClient({ clientId, mode: "ui", connId: "conn-ui-1" }),
      });
      expect(jobCreate?.createdBy).toEqual({ kind: "ui", id: "conn-ui-1" });
    }
  });

  it("stamps mcp-loopback provenance with the agent session key for gateway-client loopback calls", async () => {
    const jobParams = {
      ...createBaseJobParams(),
      sessionKey: "agent_sasuke:main",
    };
    const { jobCreate } = await invokeCronAdd({
      jobParams,
      client: createClient({ clientId: "gateway-client", mode: "backend", connId: "conn-loop" }),
    });
    // The agent-tool loopback: the id is the calling agent's session key.
    expect(jobCreate?.createdBy).toEqual({
      kind: "mcp-loopback",
      id: "agent_sasuke:main",
    });
  });

  it("falls back to connId for backend loopback calls without a session key", async () => {
    const { jobCreate } = await invokeCronAdd({
      client: createClient({ clientId: "gateway-client", mode: "backend", connId: "conn-loop-2" }),
    });
    expect(jobCreate?.createdBy).toEqual({ kind: "mcp-loopback", id: "conn-loop-2" });
  });

  it("stamps internal provenance when no client context exists", async () => {
    const { jobCreate } = await invokeCronAdd({ client: null });
    expect(jobCreate?.createdBy).toEqual({ kind: "internal", id: "gateway" });
  });

  it("overwrites a forged createdBy supplied by the client", async () => {
    const jobParams = {
      ...createBaseJobParams(),
      createdBy: { kind: "ui", id: "forged" },
    };
    const { respondCalls, jobCreate } = await invokeCronAdd({
      jobParams,
      client: createClient({ clientId: "gateway-client", mode: "backend" }),
    });
    // The wire schema rejects the unknown field; when validation is bypassed
    // (or a direct service caller threads one through), the server-side
    // provenance still wins.
    if (respondCalls[0]?.[0] === true) {
      expect(jobCreate?.createdBy?.kind).toBe("mcp-loopback");
      expect(jobCreate?.createdBy?.id).not.toBe("forged");
    } else {
      expect(jobCreate).toBeUndefined();
    }
  });

  it("logs creator provenance in the job created journal line", async () => {
    const { context } = await invokeCronAdd({
      client: createClient({ clientId: "cli", mode: "cli" }),
    });
    const info = vi.mocked(context.logGateway).info as unknown as ReturnType<typeof vi.fn>;
    expect(info).toHaveBeenCalledWith(
      "cron: job created",
      expect.objectContaining({
        createdByKind: "cli",
        createdBy: "cli:cli",
      }),
    );
  });
});
