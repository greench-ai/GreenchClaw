#!/usr/bin/env python3
"""Mass rename GreenchClaw → GreenchClaw in source files."""
import re
import os
import sys
from pathlib import Path

REPO = Path(__file__).parent.parent

replacements = [
    # 0. Specific type names (before general word replacement)
    (r'\bNexisClawPluginApi\b', 'GreenchClawPluginApi'),
    (r'\bNexisClawConfig\b', 'GreenchClawConfig'),
    # 1. Simple word replacements
    (r'\bNexisClaw\b', 'GreenchClaw'),
    (r'\bNEXISCLAW_', 'GREENCHCLAW_'),
    (r'\bnexisclaw\b', 'greench-claw'),
    # 2. Repo references
    (r"GreenchClaw/GreenchClaw\b", 'greench-ai/greench-claw'),
    (r"greench-claw/greench-claw", 'greench-ai/greench-claw'),
    # 3. Package references
    (r'@GreenchClaw/', '@GreenchClaw/'),
    (r'@greench-claw/', '@greench-claw/'),
    # 4. File references
    (r'GreenchClaw\.mjs', 'GreenchClaw.mjs'),
    (r'GreenchClaw-', 'GreenchClaw-'),
    (r'GreenchClaw_', 'GreenchClaw_'),
    # 5. Workflow-specific references
    (r'node GreenchClaw\.mjs', 'node GreenchClaw.mjs'),
    # 6. Env var references
    (r'\bPUBLISH_NEXISCLAW_NPM\b', 'PUBLISH_GREENCHCLAW_NPM'),
    (r'\bNEXISCLAW_CI_REPOSITORY\b', 'GREENCHCLAW_CI_REPOSITORY'),
    (r'\bNX_', 'GREENCH_'),
    # 7. Swift Package names
    (r'GreenchClawKit', 'GreenchClawKit'),
    # 8. Workflow repo references
    (r"github\.repository == 'GreenchClaw/GreenchClaw'", "github.repository == 'greench-ai/greench-claw'"),
    (r"'GreenchClaw/GreenchClaw'", "'greench-ai/greench-claw'"),
]

SKIP_DIRS = {'.git', 'node_modules', 'dist', 'dist-sea', 'dist-runtime', '.pnpm-store'}
SKIP_FILES = {'.gitignore', '.npmrc', 'package-lock.json', 'pnpm-lock.yaml'}
TEXT_EXTS = {
    '.py', '.sh', '.bash', '.mjs', '.cjs', '.ts', '.js',
    '.json', '.yml', '.yaml', '.md', '.txt', '.rst',
    '.html', '.css', '.scss', '.vue', '.svelte',
    '.xml', '.toml', '.ini', '.cfg', '.conf',
}

def should_process(path: Path) -> bool:
    if path.is_dir():
        return False
    if any(part in SKIP_DIRS for part in path.parts):
        return False
    if path.name in SKIP_FILES:
        return False
    if path.suffix in TEXT_EXTS:
        return True
    if path.name in {'Makefile', 'Dockerfile', 'Vagrantfile', 'Brewfile', 'CONTRIBUTING.md', 'SECURITY.md'}:
        return True
    return False

def fix_content(content: str) -> tuple[str, int]:
    count = 0
    result = content
    for pattern, replacement in replacements:
        new_result, n = re.subn(pattern, replacement, result)
        if n > 0:
            count += n
            result = new_result
    return result, count

def process_file(path: Path) -> bool:
    try:
        content = path.read_text(encoding='utf-8', errors='replace')
    except Exception as e:
        print(f"  SKIP {path}: {e}", file=sys.stderr)
        return False
    fixed, count = fix_content(content)
    if count == 0:
        return False
    path.write_text(fixed, encoding='utf-8')
    print(f"  {count:3d}x {path.relative_to(REPO)}")
    return True

def main():
    files = [Path(p) for p in sys.argv[1:]] if len(sys.argv) > 1 else []
    if not files:
        for root, dirs, filenames in os.walk(REPO):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for fn in filenames:
                files.append(Path(root) / fn)
    files = [f for f in files if should_process(f)]
    print(f"Mass-renaming GreenchClaw -> GreenchClaw in {len(files)} files...\n")
    changed = 0
    for f in sorted(files):
        if process_file(f):
            changed += 1
    print(f"\nDone. Changed {changed} files.")

if __name__ == '__main__':
    main()
