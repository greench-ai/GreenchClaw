import { describeOpenRouterProviderRuntimeContract } from "GreenchClaw/plugin-sdk/provider-test-contracts";

describeOpenRouterProviderRuntimeContract(() => import("./index.js"));
