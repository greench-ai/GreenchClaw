// The npm tokenjuice package exposes its host entry as "./openclaw" (upstream
// naming); import it and re-export under the GreenchClaw-local alias used by the
// middleware (the "tokenjuice/GreenchClaw" subpath never existed in the package's
// exports map — the TS2307 shipped since 57ff1b60).
export { createTokenjuiceOpenClawEmbeddedExtension as createTokenjuiceGreenchClawEmbeddedExtension } from "tokenjuice/openclaw";
