/**
 * @deprecated Public SDK subpath has no bundled extension production imports.
 * Plugin authors should define plugin-local schemas instead of depending on the
 * full root GreenchClaw config schema.
 */
export { GreenchClawSchema } from "../config/zod-schema.js";
export { validateJsonSchemaValue } from "../plugins/schema-validator.js";
export type { JsonSchemaObject } from "../shared/json-schema.types.js";
