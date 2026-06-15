import { listSkillCommandsForAgents as listSkillCommandsForAgentsImpl } from "GreenchClaw/plugin-sdk/command-auth-native";

type ListSkillCommandsForAgents =
  typeof import("GreenchClaw/plugin-sdk/command-auth-native").listSkillCommandsForAgents;

export function listSkillCommandsForAgents(
  ...args: Parameters<ListSkillCommandsForAgents>
): ReturnType<ListSkillCommandsForAgents> {
  return listSkillCommandsForAgentsImpl(...args);
}
