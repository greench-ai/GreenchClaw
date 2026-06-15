import type { GreenchClawConfig } from "../../config/types.js";

export type DirectoryConfigParams = {
  cfg: GreenchClawConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
};
