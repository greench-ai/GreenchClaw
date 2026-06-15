import { describeAnthropicProviderRuntimeContract } from "GreenchClaw/plugin-sdk/provider-test-contracts";

describeAnthropicProviderRuntimeContract(() => import("./index.js"));
