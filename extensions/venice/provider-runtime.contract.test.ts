import { describeVeniceProviderRuntimeContract } from "GreenchClaw/plugin-sdk/provider-test-contracts";

describeVeniceProviderRuntimeContract(() => import("./index.js"));
