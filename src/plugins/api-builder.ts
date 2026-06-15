import type { GreenchClawConfig } from "../config/types.GreenchClaw.js";
import { attachPluginApiFacades, type GreenchClawPluginApiWithoutFacades } from "./api-facades.js";
import type { PluginRuntime } from "./runtime/types.js";
import type { GreenchClawPluginApi, PluginLogger } from "./types.js";

export type BuildPluginApiParams = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  rootDir?: string;
  registrationMode: GreenchClawPluginApi["registrationMode"];
  config: GreenchClawConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;
  resolvePath: (input: string) => string;
  handlers?: Partial<
    Pick<
      GreenchClawPluginApi,
      | "registerTool"
      | "registerHook"
      | "registerHttpRoute"
      | "registerHostedMediaResolver"
      | "registerChannel"
      | "registerGatewayMethod"
      | "registerCli"
      | "registerReload"
      | "registerNodeHostCommand"
      | "registerNodeInvokePolicy"
      | "registerSecurityAuditCollector"
      | "registerService"
      | "registerGatewayDiscoveryService"
      | "registerCliBackend"
      | "registerTextTransforms"
      | "registerConfigMigration"
      | "registerMigrationProvider"
      | "registerAutoEnableProbe"
      | "registerProvider"
      | "registerModelCatalogProvider"
      | "registerSpeechProvider"
      | "registerRealtimeTranscriptionProvider"
      | "registerRealtimeVoiceProvider"
      | "registerMediaUnderstandingProvider"
      | "registerImageGenerationProvider"
      | "registerVideoGenerationProvider"
      | "registerMusicGenerationProvider"
      | "registerWebFetchProvider"
      | "registerWebSearchProvider"
      | "registerInteractiveHandler"
      | "onConversationBindingResolved"
      | "registerCommand"
      | "registerContextEngine"
      | "registerCompactionProvider"
      | "registerAgentHarness"
      | "registerCodexAppServerExtensionFactory"
      | "registerAgentToolResultMiddleware"
      | "registerSessionExtension"
      | "enqueueNextTurnInjection"
      | "registerTrustedToolPolicy"
      | "registerToolMetadata"
      | "registerControlUiDescriptor"
      | "registerRuntimeLifecycle"
      | "registerAgentEventSubscription"
      | "emitAgentEvent"
      | "setRunContext"
      | "getRunContext"
      | "clearRunContext"
      | "registerSessionSchedulerJob"
      | "registerSessionAction"
      | "sendSessionAttachment"
      | "scheduleSessionTurn"
      | "unscheduleSessionTurnsByTag"
      | "registerDetachedTaskRuntime"
      | "registerMemoryCapability"
      | "registerMemoryPromptSection"
      | "registerMemoryPromptSupplement"
      | "registerMemoryCorpusSupplement"
      | "registerMemoryFlushPlan"
      | "registerMemoryRuntime"
      | "registerMemoryEmbeddingProvider"
      | "on"
    >
  >;
};

const noopRegisterTool: GreenchClawPluginApi["registerTool"] = () => {};
const noopRegisterHook: GreenchClawPluginApi["registerHook"] = () => {};
const noopRegisterHttpRoute: GreenchClawPluginApi["registerHttpRoute"] = () => {};
const noopRegisterHostedMediaResolver: GreenchClawPluginApi["registerHostedMediaResolver"] =
  () => {};
const noopRegisterChannel: GreenchClawPluginApi["registerChannel"] = () => {};
const noopRegisterGatewayMethod: GreenchClawPluginApi["registerGatewayMethod"] = () => {};
const noopRegisterCli: GreenchClawPluginApi["registerCli"] = () => {};
const noopRegisterReload: GreenchClawPluginApi["registerReload"] = () => {};
const noopRegisterNodeHostCommand: GreenchClawPluginApi["registerNodeHostCommand"] = () => {};
const noopRegisterNodeInvokePolicy: GreenchClawPluginApi["registerNodeInvokePolicy"] = () => {};
const noopRegisterSecurityAuditCollector: GreenchClawPluginApi["registerSecurityAuditCollector"] =
  () => {};
const noopRegisterService: GreenchClawPluginApi["registerService"] = () => {};
const noopRegisterGatewayDiscoveryService: GreenchClawPluginApi["registerGatewayDiscoveryService"] =
  () => {};
const noopRegisterCliBackend: GreenchClawPluginApi["registerCliBackend"] = () => {};
const noopRegisterTextTransforms: GreenchClawPluginApi["registerTextTransforms"] = () => {};
const noopRegisterConfigMigration: GreenchClawPluginApi["registerConfigMigration"] = () => {};
const noopRegisterMigrationProvider: GreenchClawPluginApi["registerMigrationProvider"] = () => {};
const noopRegisterAutoEnableProbe: GreenchClawPluginApi["registerAutoEnableProbe"] = () => {};
const noopRegisterProvider: GreenchClawPluginApi["registerProvider"] = () => {};
const noopRegisterModelCatalogProvider: GreenchClawPluginApi["registerModelCatalogProvider"] =
  () => {};
const noopRegisterSpeechProvider: GreenchClawPluginApi["registerSpeechProvider"] = () => {};
const noopRegisterRealtimeTranscriptionProvider: GreenchClawPluginApi["registerRealtimeTranscriptionProvider"] =
  () => {};
const noopRegisterRealtimeVoiceProvider: GreenchClawPluginApi["registerRealtimeVoiceProvider"] =
  () => {};
const noopRegisterMediaUnderstandingProvider: GreenchClawPluginApi["registerMediaUnderstandingProvider"] =
  () => {};
const noopRegisterImageGenerationProvider: GreenchClawPluginApi["registerImageGenerationProvider"] =
  () => {};
const noopRegisterVideoGenerationProvider: GreenchClawPluginApi["registerVideoGenerationProvider"] =
  () => {};
const noopRegisterMusicGenerationProvider: GreenchClawPluginApi["registerMusicGenerationProvider"] =
  () => {};
const noopRegisterWebFetchProvider: GreenchClawPluginApi["registerWebFetchProvider"] = () => {};
const noopRegisterWebSearchProvider: GreenchClawPluginApi["registerWebSearchProvider"] = () => {};
const noopRegisterInteractiveHandler: GreenchClawPluginApi["registerInteractiveHandler"] = () => {};
const noopOnConversationBindingResolved: GreenchClawPluginApi["onConversationBindingResolved"] =
  () => {};
const noopRegisterCommand: GreenchClawPluginApi["registerCommand"] = () => {};
const noopRegisterContextEngine: GreenchClawPluginApi["registerContextEngine"] = () => {};
const noopRegisterCompactionProvider: GreenchClawPluginApi["registerCompactionProvider"] = () => {};
const noopRegisterAgentHarness: GreenchClawPluginApi["registerAgentHarness"] = () => {};
const noopRegisterCodexAppServerExtensionFactory: GreenchClawPluginApi["registerCodexAppServerExtensionFactory"] =
  () => {};
const noopRegisterAgentToolResultMiddleware: GreenchClawPluginApi["registerAgentToolResultMiddleware"] =
  () => {};
const noopRegisterSessionExtension: GreenchClawPluginApi["registerSessionExtension"] = () => {};
const noopEnqueueNextTurnInjection: GreenchClawPluginApi["enqueueNextTurnInjection"] = async (
  injection,
) => ({ enqueued: false, id: "", sessionKey: injection.sessionKey });
const noopRegisterTrustedToolPolicy: GreenchClawPluginApi["registerTrustedToolPolicy"] = () => {};
const noopRegisterToolMetadata: GreenchClawPluginApi["registerToolMetadata"] = () => {};
const noopRegisterControlUiDescriptor: GreenchClawPluginApi["registerControlUiDescriptor"] =
  () => {};
const noopRegisterRuntimeLifecycle: GreenchClawPluginApi["registerRuntimeLifecycle"] = () => {};
const noopRegisterAgentEventSubscription: GreenchClawPluginApi["registerAgentEventSubscription"] =
  () => {};
const noopEmitAgentEvent: GreenchClawPluginApi["emitAgentEvent"] = () => ({
  emitted: false,
  reason: "not wired",
});
const noopSetRunContext: GreenchClawPluginApi["setRunContext"] = () => false;
const noopGetRunContext: GreenchClawPluginApi["getRunContext"] = () => undefined;
const noopClearRunContext: GreenchClawPluginApi["clearRunContext"] = () => {};
const noopRegisterSessionSchedulerJob: GreenchClawPluginApi["registerSessionSchedulerJob"] = () =>
  undefined;
const noopRegisterSessionAction: GreenchClawPluginApi["registerSessionAction"] = () => {};
const noopSendSessionAttachment: GreenchClawPluginApi["sendSessionAttachment"] = async () => ({
  ok: false,
  error: "not wired",
});
const noopScheduleSessionTurn: GreenchClawPluginApi["scheduleSessionTurn"] = async () => undefined;
const noopUnscheduleSessionTurnsByTag: GreenchClawPluginApi["unscheduleSessionTurnsByTag"] =
  async () => ({ removed: 0, failed: 0 });
const noopRegisterDetachedTaskRuntime: GreenchClawPluginApi["registerDetachedTaskRuntime"] =
  () => {};
const noopRegisterMemoryCapability: GreenchClawPluginApi["registerMemoryCapability"] = () => {};
const noopRegisterMemoryPromptSection: GreenchClawPluginApi["registerMemoryPromptSection"] =
  () => {};
const noopRegisterMemoryPromptSupplement: GreenchClawPluginApi["registerMemoryPromptSupplement"] =
  () => {};
const noopRegisterMemoryCorpusSupplement: GreenchClawPluginApi["registerMemoryCorpusSupplement"] =
  () => {};
const noopRegisterMemoryFlushPlan: GreenchClawPluginApi["registerMemoryFlushPlan"] = () => {};
const noopRegisterMemoryRuntime: GreenchClawPluginApi["registerMemoryRuntime"] = () => {};
const noopRegisterMemoryEmbeddingProvider: GreenchClawPluginApi["registerMemoryEmbeddingProvider"] =
  () => {};
const noopOn: GreenchClawPluginApi["on"] = () => {};

export function buildPluginApi(params: BuildPluginApiParams): GreenchClawPluginApi {
  const handlers = params.handlers ?? {};
  const registerCli = handlers.registerCli ?? noopRegisterCli;
  const api: GreenchClawPluginApiWithoutFacades = {
    id: params.id,
    name: params.name,
    version: params.version,
    description: params.description,
    source: params.source,
    rootDir: params.rootDir,
    registrationMode: params.registrationMode,
    config: params.config,
    pluginConfig: params.pluginConfig,
    runtime: params.runtime,
    logger: params.logger,
    registerTool: handlers.registerTool ?? noopRegisterTool,
    registerHook: handlers.registerHook ?? noopRegisterHook,
    registerHttpRoute: handlers.registerHttpRoute ?? noopRegisterHttpRoute,
    registerHostedMediaResolver:
      handlers.registerHostedMediaResolver ?? noopRegisterHostedMediaResolver,
    registerChannel: handlers.registerChannel ?? noopRegisterChannel,
    registerGatewayMethod: handlers.registerGatewayMethod ?? noopRegisterGatewayMethod,
    registerCli,
    registerNodeCliFeature: (registrar, opts) =>
      registerCli(registrar, {
        ...opts,
        parentPath: ["nodes"],
      }),
    registerReload: handlers.registerReload ?? noopRegisterReload,
    registerNodeHostCommand: handlers.registerNodeHostCommand ?? noopRegisterNodeHostCommand,
    registerNodeInvokePolicy: handlers.registerNodeInvokePolicy ?? noopRegisterNodeInvokePolicy,
    registerSecurityAuditCollector:
      handlers.registerSecurityAuditCollector ?? noopRegisterSecurityAuditCollector,
    registerService: handlers.registerService ?? noopRegisterService,
    registerGatewayDiscoveryService:
      handlers.registerGatewayDiscoveryService ?? noopRegisterGatewayDiscoveryService,
    registerCliBackend: handlers.registerCliBackend ?? noopRegisterCliBackend,
    registerTextTransforms: handlers.registerTextTransforms ?? noopRegisterTextTransforms,
    registerConfigMigration: handlers.registerConfigMigration ?? noopRegisterConfigMigration,
    registerMigrationProvider: handlers.registerMigrationProvider ?? noopRegisterMigrationProvider,
    registerAutoEnableProbe: handlers.registerAutoEnableProbe ?? noopRegisterAutoEnableProbe,
    registerProvider: handlers.registerProvider ?? noopRegisterProvider,
    registerModelCatalogProvider:
      handlers.registerModelCatalogProvider ?? noopRegisterModelCatalogProvider,
    registerSpeechProvider: handlers.registerSpeechProvider ?? noopRegisterSpeechProvider,
    registerRealtimeTranscriptionProvider:
      handlers.registerRealtimeTranscriptionProvider ?? noopRegisterRealtimeTranscriptionProvider,
    registerRealtimeVoiceProvider:
      handlers.registerRealtimeVoiceProvider ?? noopRegisterRealtimeVoiceProvider,
    registerMediaUnderstandingProvider:
      handlers.registerMediaUnderstandingProvider ?? noopRegisterMediaUnderstandingProvider,
    registerImageGenerationProvider:
      handlers.registerImageGenerationProvider ?? noopRegisterImageGenerationProvider,
    registerVideoGenerationProvider:
      handlers.registerVideoGenerationProvider ?? noopRegisterVideoGenerationProvider,
    registerMusicGenerationProvider:
      handlers.registerMusicGenerationProvider ?? noopRegisterMusicGenerationProvider,
    registerWebFetchProvider: handlers.registerWebFetchProvider ?? noopRegisterWebFetchProvider,
    registerWebSearchProvider: handlers.registerWebSearchProvider ?? noopRegisterWebSearchProvider,
    registerInteractiveHandler:
      handlers.registerInteractiveHandler ?? noopRegisterInteractiveHandler,
    onConversationBindingResolved:
      handlers.onConversationBindingResolved ?? noopOnConversationBindingResolved,
    registerCommand: handlers.registerCommand ?? noopRegisterCommand,
    registerContextEngine: handlers.registerContextEngine ?? noopRegisterContextEngine,
    registerCompactionProvider:
      handlers.registerCompactionProvider ?? noopRegisterCompactionProvider,
    registerAgentHarness: handlers.registerAgentHarness ?? noopRegisterAgentHarness,
    registerCodexAppServerExtensionFactory:
      handlers.registerCodexAppServerExtensionFactory ?? noopRegisterCodexAppServerExtensionFactory,
    registerAgentToolResultMiddleware:
      handlers.registerAgentToolResultMiddleware ?? noopRegisterAgentToolResultMiddleware,
    registerSessionExtension: handlers.registerSessionExtension ?? noopRegisterSessionExtension,
    enqueueNextTurnInjection: handlers.enqueueNextTurnInjection ?? noopEnqueueNextTurnInjection,
    registerTrustedToolPolicy: handlers.registerTrustedToolPolicy ?? noopRegisterTrustedToolPolicy,
    registerToolMetadata: handlers.registerToolMetadata ?? noopRegisterToolMetadata,
    registerControlUiDescriptor:
      handlers.registerControlUiDescriptor ?? noopRegisterControlUiDescriptor,
    registerRuntimeLifecycle: handlers.registerRuntimeLifecycle ?? noopRegisterRuntimeLifecycle,
    registerAgentEventSubscription:
      handlers.registerAgentEventSubscription ?? noopRegisterAgentEventSubscription,
    emitAgentEvent: handlers.emitAgentEvent ?? noopEmitAgentEvent,
    setRunContext: handlers.setRunContext ?? noopSetRunContext,
    getRunContext: handlers.getRunContext ?? noopGetRunContext,
    clearRunContext: handlers.clearRunContext ?? noopClearRunContext,
    registerSessionSchedulerJob:
      handlers.registerSessionSchedulerJob ?? noopRegisterSessionSchedulerJob,
    registerSessionAction: handlers.registerSessionAction ?? noopRegisterSessionAction,
    sendSessionAttachment: handlers.sendSessionAttachment ?? noopSendSessionAttachment,
    scheduleSessionTurn: handlers.scheduleSessionTurn ?? noopScheduleSessionTurn,
    unscheduleSessionTurnsByTag:
      handlers.unscheduleSessionTurnsByTag ?? noopUnscheduleSessionTurnsByTag,
    registerDetachedTaskRuntime:
      handlers.registerDetachedTaskRuntime ?? noopRegisterDetachedTaskRuntime,
    registerMemoryCapability: handlers.registerMemoryCapability ?? noopRegisterMemoryCapability,
    registerMemoryPromptSection:
      handlers.registerMemoryPromptSection ?? noopRegisterMemoryPromptSection,
    registerMemoryPromptSupplement:
      handlers.registerMemoryPromptSupplement ?? noopRegisterMemoryPromptSupplement,
    registerMemoryCorpusSupplement:
      handlers.registerMemoryCorpusSupplement ?? noopRegisterMemoryCorpusSupplement,
    registerMemoryFlushPlan: handlers.registerMemoryFlushPlan ?? noopRegisterMemoryFlushPlan,
    registerMemoryRuntime: handlers.registerMemoryRuntime ?? noopRegisterMemoryRuntime,
    registerMemoryEmbeddingProvider:
      handlers.registerMemoryEmbeddingProvider ?? noopRegisterMemoryEmbeddingProvider,
    resolvePath: params.resolvePath,
    on: handlers.on ?? noopOn,
  };
  return attachPluginApiFacades(api);
}
