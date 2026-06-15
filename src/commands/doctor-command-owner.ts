import { formatCliCommand } from "../cli/command-format.js";
import type { GreenchClawConfig } from "../config/types.GreenchClaw.js";
import type { PairingChannel } from "../pairing/pairing-store.types.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";
import { note } from "../terminal/note.js";

function resolveConfiguredCommandOwners(cfg: GreenchClawConfig): string[] {
  const owners = cfg.commands?.ownerAllowFrom;
  if (!Array.isArray(owners)) {
    return [];
  }
  return owners.map((entry) => normalizeOptionalString(String(entry ?? "")) ?? "").filter(Boolean);
}

export function hasConfiguredCommandOwners(cfg: GreenchClawConfig): boolean {
  return resolveConfiguredCommandOwners(cfg).length > 0;
}

export function formatCommandOwnerFromChannelSender(params: {
  channel: PairingChannel;
  id: string;
}): string | null {
  const id = normalizeOptionalString(params.id);
  if (!id) {
    return null;
  }
  const separatorIndex = id.indexOf(":");
  if (separatorIndex > 0) {
    const prefix = id.slice(0, separatorIndex);
    if (prefix.toLowerCase() === String(params.channel).toLowerCase()) {
      return id;
    }
  }
  return `${params.channel}:${id}`;
}

export function noteCommandOwnerHealth(cfg: GreenchClawConfig): void {
  if (hasConfiguredCommandOwners(cfg)) {
    return;
  }
  note(
    [
      "No command owner is configured.",
      "A command owner is the human operator account allowed to run owner-only commands and approve dangerous actions, including /diagnostics, /export-trajectory, /config, and exec approvals.",
      "DM pairing only lets someone talk to the bot; it does not make that sender the owner for privileged commands.",
      `Fix: set commands.ownerAllowFrom to your channel user id, for example ${formatCliCommand("GreenchClaw config set commands.ownerAllowFrom '[\"telegram:123456789\"]'")}`,
      "Restart the gateway after changing this if it is already running.",
    ].join("\n"),
    "Command owner",
  );
}
