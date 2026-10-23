export const PROJECT_NAME = "GreenchClaw" as const;

const LEGACY_PROJECT_NAMES = ["clawdbot"] as const;

export const MANIFEST_KEY = PROJECT_NAME;

export const LEGACY_MANIFEST_KEYS = LEGACY_PROJECT_NAMES;

// The macOS target ships as `OpenClaw` in this repo; keep the constant name for
// callers but point it at the directory that actually contains the Swift sources.
export const MACOS_APP_SOURCES_DIR = "apps/macos/Sources/OpenClaw" as const;
