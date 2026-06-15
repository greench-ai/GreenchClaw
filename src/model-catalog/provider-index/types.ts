import type { ModelCatalogProvider } from "../types.js";

export type GreenchClawProviderIndexPluginInstall = {
  clawhubSpec?: string;
  npmSpec?: string;
  defaultChoice?: "clawhub" | "npm";
  minHostVersion?: string;
  expectedIntegrity?: string;
};

export type GreenchClawProviderIndexPlugin = {
  id: string;
  package?: string;
  source?: string;
  install?: GreenchClawProviderIndexPluginInstall;
};

export type GreenchClawProviderIndexProviderAuthChoice = {
  method: string;
  choiceId: string;
  choiceLabel: string;
  choiceHint?: string;
  assistantPriority?: number;
  assistantVisibility?: "visible" | "manual-only";
  groupId?: string;
  groupLabel?: string;
  groupHint?: string;
  optionKey?: string;
  cliFlag?: string;
  cliOption?: string;
  cliDescription?: string;
  onboardingScopes?: readonly ("text-inference" | "image-generation")[];
};

export type GreenchClawProviderIndexProvider = {
  id: string;
  name: string;
  plugin: GreenchClawProviderIndexPlugin;
  docs?: string;
  categories?: readonly string[];
  authChoices?: readonly GreenchClawProviderIndexProviderAuthChoice[];
  previewCatalog?: ModelCatalogProvider;
};

export type GreenchClawProviderIndex = {
  version: number;
  providers: Readonly<Record<string, GreenchClawProviderIndexProvider>>;
};
