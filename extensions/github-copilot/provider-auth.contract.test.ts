import { describeGithubCopilotProviderAuthContract } from "GreenchClaw/plugin-sdk/provider-test-contracts";

describeGithubCopilotProviderAuthContract(() => import("./index.js"));
