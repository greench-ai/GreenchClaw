# Uncodixify — install notes (Sasuke, 2026-09-24)

Source: https://github.com/dazeb/uncodixify-skill (builds on cyxzdev/Uncodixify)

Installed at: GreenchClaw/skills/uncodixify/

Verified working:
- `python3 ./bin/validate-package.py` -> PASS
- `./bin/run-uncodixify.sh <file.tsx>` -> catches radii/purple/gradient/shadow/eyebrow violations
- `npx tsx ./toolchain/autofix-uncodixify.ts <file.tsx>` -> conservative autofix (leaves some purples on hover states)

Use for React/Tailwind front-end work to keep UI out of generic AI-dashboard territory.
