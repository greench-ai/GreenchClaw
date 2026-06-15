import { describeGoogleProviderRuntimeContract } from "GreenchClaw/plugin-sdk/provider-test-contracts";

describeGoogleProviderRuntimeContract(() => import("./index.js"));
