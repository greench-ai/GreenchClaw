export const GREENCHCLAW_CLI_ENV_VAR = "GREENCHCLAW_CLI";
export const GREENCHCLAW_CLI_ENV_VALUE = "1";

export function markGreenchClawExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [GREENCHCLAW_CLI_ENV_VAR]: GREENCHCLAW_CLI_ENV_VALUE,
  };
}

export function ensureGreenchClawExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[GREENCHCLAW_CLI_ENV_VAR] = GREENCHCLAW_CLI_ENV_VALUE;
  return env;
}
