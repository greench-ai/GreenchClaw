export type GreenchClawPiCodingAgentSkillSourceAugmentation = never;

declare module "@earendil-works/pi-coding-agent" {
  interface Skill {
    // GreenchClaw relies on the source identifier returned by pi skill loaders.
    source: string;
  }
}
