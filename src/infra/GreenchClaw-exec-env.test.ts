import { describe, expect, it } from "vitest";
import {
  ensureGreenchClawExecMarkerOnProcess,
  markGreenchClawExecEnv,
  GREENCHCLAW_CLI_ENV_VALUE,
  GREENCHCLAW_CLI_ENV_VAR,
} from "./GreenchClaw-exec-env.js";

describe("markGreenchClawExecEnv", () => {
  it("returns a cloned env object with the exec marker set", () => {
    const env = { PATH: "/usr/bin", GREENCHCLAW_CLI: "0" };
    const marked = markGreenchClawExecEnv(env);

    expect(marked).toEqual({
      PATH: "/usr/bin",
      GREENCHCLAW_CLI: GREENCHCLAW_CLI_ENV_VALUE,
    });
    expect(marked).not.toBe(env);
    expect(env.GREENCHCLAW_CLI).toBe("0");
  });
});

describe("ensureGreenchClawExecMarkerOnProcess", () => {
  it.each([
    {
      name: "mutates and returns the provided process env",
      env: { PATH: "/usr/bin" } as NodeJS.ProcessEnv,
    },
    {
      name: "overwrites an existing marker on the provided process env",
      env: { PATH: "/usr/bin", [GREENCHCLAW_CLI_ENV_VAR]: "0" } as NodeJS.ProcessEnv,
    },
  ])("$name", ({ env }) => {
    expect(ensureGreenchClawExecMarkerOnProcess(env)).toBe(env);
    expect(env[GREENCHCLAW_CLI_ENV_VAR]).toBe(GREENCHCLAW_CLI_ENV_VALUE);
  });

  it("defaults to mutating process.env when no env object is provided", () => {
    const previous = process.env[GREENCHCLAW_CLI_ENV_VAR];
    delete process.env[GREENCHCLAW_CLI_ENV_VAR];

    try {
      expect(ensureGreenchClawExecMarkerOnProcess()).toBe(process.env);
      expect(process.env[GREENCHCLAW_CLI_ENV_VAR]).toBe(GREENCHCLAW_CLI_ENV_VALUE);
    } finally {
      if (previous === undefined) {
        delete process.env[GREENCHCLAW_CLI_ENV_VAR];
      } else {
        process.env[GREENCHCLAW_CLI_ENV_VAR] = previous;
      }
    }
  });
});
