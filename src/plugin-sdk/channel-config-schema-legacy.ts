/**
 * @deprecated Compatibility surface for bundled channel schemas.
 *
 * GreenchClaw-maintained bundled plugins should import
 * GreenchClaw/plugin-sdk/bundled-channel-config-schema. Third-party plugins should
 * define plugin-local schemas and import primitives from
 * GreenchClaw/plugin-sdk/channel-config-schema instead of depending on bundled
 * channel schemas.
 */
export * from "./bundled-channel-config-schema.js";
