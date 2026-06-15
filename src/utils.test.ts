import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempDir } from "./test-helpers/temp-dir.js";
import {
  ensureDir,
  resolveConfigDir,
  resolveHomeDir,
  resolveUserPath,
  shortenHomeInString,
  shortenHomePath,
  sleep,
} from "./utils.js";

describe("ensureDir", () => {
  it("creates nested directory", async () => {
    await withTempDir({ prefix: "GreenchClaw-test-" }, async (tmp) => {
      const target = path.join(tmp, "nested", "dir");
      await ensureDir(target);
      expect(fs.existsSync(target)).toBe(true);
    });
  });
});

describe("sleep", () => {
  it("resolves after delay using fake timers", async () => {
    vi.useFakeTimers();
    try {
      const promise = sleep(1000);
      vi.advanceTimersByTime(1000);
      await expect(promise).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("resolveConfigDir", () => {
  it("prefers ~/.GreenchClaw when legacy dir is missing", async () => {
    await withTempDir({ prefix: "GreenchClaw-config-dir-" }, async (root) => {
      const newDir = path.join(root, ".GreenchClaw");
      await fs.promises.mkdir(newDir, { recursive: true });
      const resolved = resolveConfigDir({} as NodeJS.ProcessEnv, () => root);
      expect(resolved).toBe(newDir);
    });
  });

  it("expands GREENCHCLAW_STATE_DIR using the provided env", () => {
    const env = {
      HOME: "/tmp/GreenchClaw-home",
      GREENCHCLAW_STATE_DIR: "~/state",
    } as NodeJS.ProcessEnv;

    expect(resolveConfigDir(env)).toBe(path.resolve("/tmp/GreenchClaw-home", "state"));
  });

  it("falls back to the config file directory when only GREENCHCLAW_CONFIG_PATH is set", () => {
    const env = {
      HOME: "/tmp/GreenchClaw-home",
      GREENCHCLAW_CONFIG_PATH: "~/profiles/dev/GreenchClaw.json",
    } as NodeJS.ProcessEnv;

    expect(resolveConfigDir(env)).toBe(path.resolve("/tmp/GreenchClaw-home", "profiles", "dev"));
  });
});

describe("resolveHomeDir", () => {
  it("prefers GREENCHCLAW_HOME over HOME", () => {
    vi.stubEnv("GREENCHCLAW_HOME", "/srv/GreenchClaw-home");
    vi.stubEnv("HOME", "/home/other");
    try {
      expect(resolveHomeDir()).toBe(path.resolve("/srv/GreenchClaw-home"));
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("shortenHomePath", () => {
  it("uses $GREENCHCLAW_HOME prefix when GREENCHCLAW_HOME is set", () => {
    vi.stubEnv("GREENCHCLAW_HOME", "/srv/GreenchClaw-home");
    vi.stubEnv("HOME", "/home/other");
    try {
      expect(
        shortenHomePath(`${path.resolve("/srv/GreenchClaw-home")}/.GreenchClaw/GreenchClaw.json`),
      ).toBe("$GREENCHCLAW_HOME/.GreenchClaw/GreenchClaw.json");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("shortenHomeInString", () => {
  it("uses $GREENCHCLAW_HOME replacement when GREENCHCLAW_HOME is set", () => {
    vi.stubEnv("GREENCHCLAW_HOME", "/srv/GreenchClaw-home");
    vi.stubEnv("HOME", "/home/other");
    try {
      expect(
        shortenHomeInString(
          `config: ${path.resolve("/srv/GreenchClaw-home")}/.GreenchClaw/GreenchClaw.json`,
        ),
      ).toBe("config: $GREENCHCLAW_HOME/.GreenchClaw/GreenchClaw.json");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("resolveUserPath", () => {
  it("expands ~ to home dir", () => {
    expect(resolveUserPath("~", {}, () => "/Users/thoffman")).toBe(path.resolve("/Users/thoffman"));
  });

  it("expands ~/ to home dir", () => {
    expect(resolveUserPath("~/GreenchClaw", {}, () => "/Users/thoffman")).toBe(
      path.resolve("/Users/thoffman", "GreenchClaw"),
    );
  });

  it("resolves relative paths", () => {
    expect(resolveUserPath("tmp/dir")).toBe(path.resolve("tmp/dir"));
  });

  it("prefers GREENCHCLAW_HOME for tilde expansion", () => {
    vi.stubEnv("GREENCHCLAW_HOME", "/srv/GreenchClaw-home");
    vi.stubEnv("HOME", "/home/other");
    try {
      expect(resolveUserPath("~/GreenchClaw")).toBe(
        path.resolve("/srv/GreenchClaw-home", "GreenchClaw"),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses the provided env for tilde expansion", () => {
    const env = {
      HOME: "/tmp/GreenchClaw-home",
      GREENCHCLAW_HOME: "/srv/GreenchClaw-home",
    } as NodeJS.ProcessEnv;

    expect(resolveUserPath("~/GreenchClaw", env)).toBe(
      path.resolve("/srv/GreenchClaw-home", "GreenchClaw"),
    );
  });

  it("keeps blank paths blank", () => {
    expect(resolveUserPath("")).toBe("");
    expect(resolveUserPath("   ")).toBe("");
  });

  it("returns empty string for undefined/null input", () => {
    expect(resolveUserPath(undefined as unknown as string)).toBe("");
    expect(resolveUserPath(null as unknown as string)).toBe("");
  });
});
