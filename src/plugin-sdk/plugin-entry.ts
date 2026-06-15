import type { GreenchClawConfig } from "../config/types.GreenchClaw.js";
import { emptyPluginConfigSchema } from "../plugins/config-schema.js";
import type {
  AnyAgentTool,
  AgentHarness,
  MediaUnderstandingProviderPlugin,
  MigrationApplyResult,
  MigrationDetection,
  MigrationItem,
  MigrationPlan,
  MigrationProviderContext,
  MigrationProviderPlugin,
  MigrationSummary,
  GreenchClawPluginApi,
  GreenchClawPluginCommandDefinition,
  GreenchClawPluginConfigSchema,
  GreenchClawPluginDefinition,
  GreenchClawPluginHttpRouteHandler,
  GreenchClawPluginNodeHostCommand,
  GreenchClawPluginNodeInvokePolicy,
  GreenchClawPluginNodeInvokePolicyContext,
  GreenchClawPluginNodeInvokePolicyResult,
  GreenchClawPluginReloadRegistration,
  GreenchClawPluginSecurityAuditCollector,
  GreenchClawPluginSecurityAuditContext,
  GreenchClawPluginService,
  GreenchClawPluginServiceContext,
  GreenchClawPluginToolContext,
  GreenchClawPluginToolFactory,
  PluginLogger,
  ProviderAugmentModelCatalogContext,
  ProviderAuthContext,
  ProviderAuthDoctorHintContext,
  ProviderAuthMethod,
  ProviderAuthMethodNonInteractiveContext,
  ProviderAuthResult,
  ProviderApplyConfigDefaultsContext,
  ProviderBuildMissingAuthMessageContext,
  ProviderBuildUnknownModelHintContext,
  ProviderBuiltInModelSuppressionContext,
  ProviderBuiltInModelSuppressionResult,
  ProviderCacheTtlEligibilityContext,
  ProviderCatalogContext,
  ProviderCatalogResult,
  ProviderDeferSyntheticProfileAuthContext,
  ProviderDefaultThinkingPolicyContext,
  ProviderDiscoveryContext,
  ProviderFailoverErrorContext,
  ProviderFetchUsageSnapshotContext,
  ProviderModernModelPolicyContext,
  ProviderNormalizeConfigContext,
  ProviderNormalizeToolSchemasContext,
  ProviderNormalizeTransportContext,
  ProviderResolveConfigApiKeyContext,
  ProviderNormalizeModelIdContext,
  ProviderNormalizeResolvedModelContext,
  ProviderPrepareDynamicModelContext,
  ProviderPrepareExtraParamsContext,
  ProviderPrepareRuntimeAuthContext,
  ProviderPreparedRuntimeAuth,
  ProviderReasoningOutputMode,
  ProviderReasoningOutputModeContext,
  ProviderReplayPolicy,
  ProviderReplayPolicyContext,
  ProviderReplaySessionEntry,
  ProviderReplaySessionState,
  RealtimeTranscriptionProviderPlugin,
  ProviderResolvedUsageAuth,
  ProviderResolveDynamicModelContext,
  ProviderResolveTransportTurnStateContext,
  ProviderResolveWebSocketSessionPolicyContext,
  ProviderSanitizeReplayHistoryContext,
  ProviderTransportTurnState,
  ProviderToolSchemaDiagnostic,
  ProviderResolveUsageAuthContext,
  ProviderThinkingProfile,
  ProviderThinkingPolicyContext,
  ProviderValidateReplayTurnsContext,
  ProviderWebSocketSessionPolicy,
  ProviderWrapStreamFnContext,
  UnifiedModelCatalogProviderContext,
  UnifiedModelCatalogProviderPlugin,
  GreenchClawGatewayDiscoveryAdvertiseContext,
  GreenchClawGatewayDiscoveryService,
  SpeechProviderPlugin,
  PluginCommandContext,
  PluginCommandResult,
  PluginAgentEventEmitParams,
  PluginAgentEventEmitResult,
  PluginAgentEventSubscriptionRegistration,
  PluginAgentTurnPrepareEvent,
  PluginAgentTurnPrepareResult,
  PluginControlUiDescriptor,
  PluginHeartbeatPromptContributionEvent,
  PluginHeartbeatPromptContributionResult,
  PluginJsonValue,
  PluginNextTurnInjection,
  PluginNextTurnInjectionEnqueueResult,
  PluginNextTurnInjectionRecord,
  PluginRunContextGetParams,
  PluginRunContextPatch,
  PluginRuntimeLifecycleRegistration,
  PluginSessionActionContext,
  PluginSessionActionRegistration,
  PluginSessionActionResult,
  PluginSessionAttachmentParams,
  PluginSessionAttachmentResult,
  PluginSessionSchedulerJobHandle,
  PluginSessionSchedulerJobRegistration,
  PluginSessionTurnScheduleParams,
  PluginSessionTurnUnscheduleByTagParams,
  PluginSessionTurnUnscheduleByTagResult,
  PluginSessionExtensionRegistration,
  PluginSessionExtensionProjection,
  PluginToolMetadataRegistration,
  PluginTrustedToolPolicyRegistration,
} from "../plugins/types.js";
import { createCachedLazyValueGetter } from "./lazy-value.js";

export type {
  AnyAgentTool,
  AgentHarness,
  MediaUnderstandingProviderPlugin,
  MigrationApplyResult,
  MigrationDetection,
  MigrationItem,
  MigrationPlan,
  MigrationProviderContext,
  MigrationProviderPlugin,
  MigrationSummary,
  GreenchClawPluginApi,
  GreenchClawPluginNodeHostCommand,
  GreenchClawPluginNodeInvokePolicy,
  GreenchClawPluginNodeInvokePolicyContext,
  GreenchClawPluginNodeInvokePolicyResult,
  GreenchClawPluginReloadRegistration,
  GreenchClawPluginSecurityAuditCollector,
  GreenchClawPluginSecurityAuditContext,
  GreenchClawPluginToolContext,
  GreenchClawPluginToolFactory,
  PluginCommandContext,
  PluginCommandResult,
  PluginAgentEventEmitParams,
  PluginAgentEventEmitResult,
  PluginAgentEventSubscriptionRegistration,
  PluginAgentTurnPrepareEvent,
  PluginAgentTurnPrepareResult,
  PluginControlUiDescriptor,
  PluginHeartbeatPromptContributionEvent,
  PluginHeartbeatPromptContributionResult,
  PluginJsonValue,
  PluginNextTurnInjection,
  PluginNextTurnInjectionEnqueueResult,
  PluginNextTurnInjectionRecord,
  PluginRunContextGetParams,
  PluginRunContextPatch,
  PluginRuntimeLifecycleRegistration,
  PluginSessionActionContext,
  PluginSessionActionRegistration,
  PluginSessionActionResult,
  PluginSessionSchedulerJobHandle,
  PluginSessionSchedulerJobRegistration,
  PluginSessionAttachmentParams,
  PluginSessionAttachmentResult,
  PluginSessionTurnScheduleParams,
  PluginSessionTurnUnscheduleByTagParams,
  PluginSessionTurnUnscheduleByTagResult,
  PluginSessionExtensionRegistration,
  PluginSessionExtensionProjection,
  PluginToolMetadataRegistration,
  PluginTrustedToolPolicyRegistration,
  GreenchClawPluginConfigSchema,
  GreenchClawPluginHttpRouteHandler,
  ProviderDiscoveryContext,
  ProviderCatalogContext,
  ProviderCatalogResult,
  ProviderDeferSyntheticProfileAuthContext,
  ProviderAugmentModelCatalogContext,
  ProviderApplyConfigDefaultsContext,
  ProviderBuiltInModelSuppressionContext,
  ProviderBuiltInModelSuppressionResult,
  ProviderBuildMissingAuthMessageContext,
  ProviderBuildUnknownModelHintContext,
  ProviderCacheTtlEligibilityContext,
  ProviderDefaultThinkingPolicyContext,
  ProviderFetchUsageSnapshotContext,
  ProviderFailoverErrorContext,
  ProviderModernModelPolicyContext,
  ProviderNormalizeConfigContext,
  ProviderNormalizeToolSchemasContext,
  ProviderNormalizeTransportContext,
  ProviderResolveConfigApiKeyContext,
  ProviderNormalizeModelIdContext,
  ProviderReplayPolicy,
  ProviderReplayPolicyContext,
  ProviderReplaySessionEntry,
  ProviderReplaySessionState,
  ProviderPreparedRuntimeAuth,
  ProviderReasoningOutputMode,
  ProviderReasoningOutputModeContext,
  ProviderResolvedUsageAuth,
  ProviderToolSchemaDiagnostic,
  ProviderPrepareExtraParamsContext,
  ProviderPrepareDynamicModelContext,
  ProviderPrepareRuntimeAuthContext,
  ProviderSanitizeReplayHistoryContext,
  ProviderResolveUsageAuthContext,
  ProviderThinkingProfile,
  ProviderResolveDynamicModelContext,
  ProviderResolveTransportTurnStateContext,
  ProviderResolveWebSocketSessionPolicyContext,
  ProviderNormalizeResolvedModelContext,
  RealtimeTranscriptionProviderPlugin,
  ProviderTransportTurnState,
  SpeechProviderPlugin,
  ProviderThinkingPolicyContext,
  ProviderValidateReplayTurnsContext,
  ProviderWebSocketSessionPolicy,
  ProviderWrapStreamFnContext,
  UnifiedModelCatalogProviderContext,
  UnifiedModelCatalogProviderPlugin,
  GreenchClawGatewayDiscoveryAdvertiseContext,
  GreenchClawGatewayDiscoveryService,
  GreenchClawPluginService,
  GreenchClawPluginServiceContext,
  ProviderAuthContext,
  ProviderAuthDoctorHintContext,
  ProviderAuthMethodNonInteractiveContext,
  ProviderAuthMethod,
  ProviderAuthResult,
  GreenchClawPluginCommandDefinition,
  GreenchClawPluginDefinition,
  PluginLogger,
};
export type {
  PluginConversationBinding,
  PluginConversationBindingResolvedEvent,
  PluginConversationBindingRequestParams,
  PluginConversationBindingRequestResult,
} from "../plugins/conversation-binding.types.js";
export type {
  PluginHookInboundClaimContext,
  PluginHookInboundClaimEvent,
  PluginHookInboundClaimResult,
} from "../plugins/hook-types.js";
export type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";
export type {
  UnifiedModelCatalogEntry,
  UnifiedModelCatalogKind,
  UnifiedModelCatalogSource,
} from "../model-catalog/types.js";
export type { GreenchClawConfig };

export {
  buildJsonPluginConfigSchema,
  buildPluginConfigSchema,
  emptyPluginConfigSchema,
} from "../plugins/config-schema.js";

/**
 * Create a tool definition for use with `api.registerTool()`.
 * @param name Tool name (must be unique within the plugin)
 * @param description Human-readable description shown to the AI
 * @param parameters JSON Schema object describing tool parameters
 * @param execute The tool's execution function
 */
export function makeTool<
  TParams extends { type: "object"; properties?: Record<string, unknown>; required?: string[] },
>(
  name: string,
  description: string,
  parameters: TParams,
  execute: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: (update: unknown) => void,
  ) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>,
): {
  name: string;
  description: string;
  parameters: TParams;
  execute: NonNullable<unknown>;
} {
  return { name, description, parameters, execute } as unknown as {
    name: string;
    description: string;
    parameters: TParams;
    execute: unknown;
  };
}

/** Options for a plugin entry that registers providers, tools, commands, or services. */
type DefinePluginEntryOptions = {
  id: string;
  name: string;
  description: string;
  /**
   * @deprecated Declare exclusive plugin kind in `GreenchClaw.plugin.json` via
   * manifest `kind`. Runtime-entry `kind` remains only as a compatibility
   * fallback for older plugins.
   */
  kind?: GreenchClawPluginDefinition["kind"];
  configSchema?: GreenchClawPluginConfigSchema | (() => GreenchClawPluginConfigSchema);
  reload?: GreenchClawPluginDefinition["reload"];
  nodeHostCommands?: GreenchClawPluginDefinition["nodeHostCommands"];
  securityAuditCollectors?: GreenchClawPluginDefinition["securityAuditCollectors"];
  register: (api: GreenchClawPluginApi) => void;
};

/** Normalized object shape that GreenchClaw loads from a plugin entry module. */
type DefinedPluginEntry = {
  id: string;
  name: string;
  description: string;
  configSchema: GreenchClawPluginConfigSchema;
  register: NonNullable<GreenchClawPluginDefinition["register"]>;
} & Pick<
  GreenchClawPluginDefinition,
  "kind" | "reload" | "nodeHostCommands" | "securityAuditCollectors"
>;

/**
 * Canonical entry helper for non-channel plugins.
 *
 * Use this for provider, tool, command, service, memory, and context-engine
 * plugins. Channel plugins should use `defineChannelPluginEntry(...)` from
 * `GreenchClaw/plugin-sdk/core` so they inherit the channel capability wiring.
 */
export function definePluginEntry({
  id,
  name,
  description,
  kind,
  configSchema = emptyPluginConfigSchema,
  reload,
  nodeHostCommands,
  securityAuditCollectors,
  register,
}: DefinePluginEntryOptions): DefinedPluginEntry {
  const getConfigSchema = createCachedLazyValueGetter(configSchema);
  return {
    id,
    name,
    description,
    ...(kind ? { kind } : {}),
    ...(reload ? { reload } : {}),
    ...(nodeHostCommands ? { nodeHostCommands } : {}),
    ...(securityAuditCollectors ? { securityAuditCollectors } : {}),
    get configSchema() {
      return getConfigSchema();
    },
    register,
  };
}
