import { describeGithubCopilotProviderRuntimeContract } from "GreenchClaw/plugin-sdk/provider-test-contracts";

describeGithubCopilotProviderRuntimeContract(() => import("./index.js"));
