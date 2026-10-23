---
name: zvec-grep
description: Local semantic+keyword search over indexed workspaces (Brain vault, agent workspace) using zg. Use when looking for notes, decisions, infrastructure facts, past findings — instead of grep or Qdrant round-trips.
---

# zvec-grep (zg) — local-first search

Two indexed workspaces:
- `/home/greench/GreenchClaw-Brain` (Obsidian vault)
- `/home/greench/.GreenchClaw/workspace` (agent workspace)

## Usage
```bash
cd <indexed-root> && zg query "natural language question"    # semantic+BM25 hybrid
zg query --rg "exact regex"                                   # pure ripgrep fallback
zg status                                                     # index state
zg index --rebuild                                            # after bulk changes
```

## Rules
- Always `cd` into a workspace root first (index is per-root)
- Results are source-linked (file:line) — read the underlying note for full context
- Rebuild index after adding many notes
- Binary at ~/.npm-global/bin/zg (v0.2.2)
