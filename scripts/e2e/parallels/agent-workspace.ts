export function posixAgentWorkspaceScript(purpose: string): string {
  return `set -eu
workspace="\${GREENCHCLAW_WORKSPACE_DIR:-$HOME/.GreenchClaw/workspace}"
mkdir -p "$workspace/.GreenchClaw"
cat > "$workspace/IDENTITY.md" <<'IDENTITY_EOF'
# Identity

- Name: GreenchClaw
- Purpose: ${purpose}
IDENTITY_EOF
cat > "$workspace/.GreenchClaw/workspace-state.json" <<'STATE_EOF'
{
  "version": 1,
  "setupCompletedAt": "2026-01-01T00:00:00.000Z"
}
STATE_EOF
rm -f "$workspace/BOOTSTRAP.md"`;
}

export function windowsAgentWorkspaceScript(purpose: string): string {
  return `$workspace = $env:GREENCHCLAW_WORKSPACE_DIR
if (-not $workspace) { $workspace = Join-Path $env:USERPROFILE '.GreenchClaw\\workspace' }
$stateDir = Join-Path $workspace '.GreenchClaw'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
@'
# Identity

- Name: GreenchClaw
- Purpose: ${purpose}
'@ | Set-Content -Path (Join-Path $workspace 'IDENTITY.md') -Encoding UTF8
@'
{
  "version": 1,
  "setupCompletedAt": "2026-01-01T00:00:00.000Z"
}
'@ | Set-Content -Path (Join-Path $stateDir 'workspace-state.json') -Encoding UTF8
Remove-Item (Join-Path $workspace 'BOOTSTRAP.md') -Force -ErrorAction SilentlyContinue`;
}
