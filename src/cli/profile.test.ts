import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "GreenchClaw",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "GreenchClaw", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("leaves gateway --dev for subcommands after leading root options", () => {
    const res = parseCliProfileArgs([
      "node",
      "GreenchClaw",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "GreenchClaw",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "GreenchClaw", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "GreenchClaw", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "GreenchClaw", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "GreenchClaw", "status"]);
  });

  it("parses interleaved --profile after the command token", () => {
    const res = parseCliProfileArgs([
      "node",
      "GreenchClaw",
      "status",
      "--profile",
      "work",
      "--deep",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "GreenchClaw", "status", "--deep"]);
  });

  it("preserves Matrix QA --profile for the command parser", () => {
    const res = parseCliProfileArgs([
      "node",
      "GreenchClaw",
      "qa",
      "matrix",
      "--profile",
      "fast",
      "--fail-fast",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "GreenchClaw",
      "qa",
      "matrix",
      "--profile",
      "fast",
      "--fail-fast",
    ]);
  });

  it("preserves Matrix QA --profile after leading root options", () => {
    const res = parseCliProfileArgs([
      "node",
      "GreenchClaw",
      "--no-color",
      "qa",
      "matrix",
      "--profile=fast",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "GreenchClaw",
      "--no-color",
      "qa",
      "matrix",
      "--profile=fast",
    ]);
  });

  it("still parses root --profile before Matrix QA", () => {
    const res = parseCliProfileArgs([
      "node",
      "GreenchClaw",
      "--profile",
      "work",
      "qa",
      "matrix",
      "--fail-fast",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "GreenchClaw", "qa", "matrix", "--fail-fast"]);
  });

  it("parses interleaved --dev after the command token", () => {
    const res = parseCliProfileArgs(["node", "GreenchClaw", "status", "--dev"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "GreenchClaw", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "GreenchClaw", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it.each([
    ["--dev first", ["node", "GreenchClaw", "--dev", "--profile", "work", "status"]],
    ["--profile first", ["node", "GreenchClaw", "--profile", "work", "--dev", "status"]],
    ["interleaved after command", ["node", "GreenchClaw", "status", "--profile", "work", "--dev"]],
  ])("rejects combining --dev with --profile (%s)", (_name, argv) => {
    const res = parseCliProfileArgs(argv);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".GreenchClaw-dev");
    expect(env.GREENCHCLAW_PROFILE).toBe("dev");
    expect(env.GREENCHCLAW_STATE_DIR).toBe(expectedStateDir);
    expect(env.GREENCHCLAW_CONFIG_PATH).toBe(path.join(expectedStateDir, "GreenchClaw.json"));
    expect(env.GREENCHCLAW_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      GREENCHCLAW_STATE_DIR: "/custom",
      GREENCHCLAW_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.GREENCHCLAW_STATE_DIR).toBe("/custom");
    expect(env.GREENCHCLAW_GATEWAY_PORT).toBe("19099");
    expect(env.GREENCHCLAW_CONFIG_PATH).toBe(path.join("/custom", "GreenchClaw.json"));
  });

  it("uses GREENCHCLAW_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      GREENCHCLAW_HOME: "/srv/GreenchClaw-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/GreenchClaw-home");
    expect(env.GREENCHCLAW_STATE_DIR).toBe(path.join(resolvedHome, ".GreenchClaw-work"));
    expect(env.GREENCHCLAW_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".GreenchClaw-work", "GreenchClaw.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it.each([
    {
      name: "no profile is set",
      cmd: "GreenchClaw doctor --fix",
      env: {},
      expected: "GreenchClaw doctor --fix",
    },
    {
      name: "profile is default",
      cmd: "GreenchClaw doctor --fix",
      env: { GREENCHCLAW_PROFILE: "default" },
      expected: "GreenchClaw doctor --fix",
    },
    {
      name: "profile is Default (case-insensitive)",
      cmd: "GreenchClaw doctor --fix",
      env: { GREENCHCLAW_PROFILE: "Default" },
      expected: "GreenchClaw doctor --fix",
    },
    {
      name: "profile is invalid",
      cmd: "GreenchClaw doctor --fix",
      env: { GREENCHCLAW_PROFILE: "bad profile" },
      expected: "GreenchClaw doctor --fix",
    },
    {
      name: "--profile is already present",
      cmd: "GreenchClaw --profile work doctor --fix",
      env: { GREENCHCLAW_PROFILE: "work" },
      expected: "GreenchClaw --profile work doctor --fix",
    },
    {
      name: "--dev is already present",
      cmd: "GreenchClaw --dev doctor",
      env: { GREENCHCLAW_PROFILE: "dev" },
      expected: "GreenchClaw --dev doctor",
    },
  ])("returns command unchanged when $name", ({ cmd, env, expected }) => {
    expect(formatCliCommand(cmd, env)).toBe(expected);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("GreenchClaw doctor --fix", { GREENCHCLAW_PROFILE: "work" })).toBe(
      "GreenchClaw --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(
      formatCliCommand("GreenchClaw doctor --fix", { GREENCHCLAW_PROFILE: "  jbGreenchClaw  " }),
    ).toBe("GreenchClaw --profile jbGreenchClaw doctor --fix");
  });

  it("handles command with no args after GreenchClaw", () => {
    expect(formatCliCommand("GreenchClaw", { GREENCHCLAW_PROFILE: "test" })).toBe(
      "GreenchClaw --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm GreenchClaw doctor", { GREENCHCLAW_PROFILE: "work" })).toBe(
      "pnpm GreenchClaw --profile work doctor",
    );
  });

  it("inserts --container when a container hint is set", () => {
    expect(
      formatCliCommand("GreenchClaw gateway status --deep", { GREENCHCLAW_CONTAINER_HINT: "demo" }),
    ).toBe("GreenchClaw --container demo gateway status --deep");
  });

  it("ignores unsafe container hints", () => {
    expect(
      formatCliCommand("GreenchClaw gateway status --deep", {
        GREENCHCLAW_CONTAINER_HINT: "demo; rm -rf /",
      }),
    ).toBe("GreenchClaw gateway status --deep");
  });

  it("preserves both --container and --profile hints", () => {
    expect(
      formatCliCommand("GreenchClaw doctor", {
        GREENCHCLAW_CONTAINER_HINT: "demo",
        GREENCHCLAW_PROFILE: "work",
      }),
    ).toBe("GreenchClaw --container demo doctor");
  });

  it("does not prepend --container for update commands", () => {
    expect(formatCliCommand("GreenchClaw update", { GREENCHCLAW_CONTAINER_HINT: "demo" })).toBe(
      "GreenchClaw update",
    );
    expect(
      formatCliCommand("pnpm GreenchClaw update --channel beta", {
        GREENCHCLAW_CONTAINER_HINT: "demo",
      }),
    ).toBe("pnpm GreenchClaw update --channel beta");
  });
});
