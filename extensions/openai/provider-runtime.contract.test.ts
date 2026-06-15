import { describeOpenAIProviderRuntimeContract } from "GreenchClaw/plugin-sdk/provider-test-contracts";

describeOpenAIProviderRuntimeContract(() => import("./index.js"));
