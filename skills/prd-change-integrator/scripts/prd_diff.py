#!/usr/bin/env python3
import sys, difflib, re
from pathlib import Path

if len(sys.argv) < 3:
    print("Usage: prd_diff.py <old.md> <new.md>")
    sys.exit(1)

old = Path(sys.argv[1]).read_text(encoding='utf-8').splitlines()
new = Path(sys.argv[2]).read_text(encoding='utf-8').splitlines()
for line in difflib.unified_diff(old, new, fromfile=sys.argv[1], tofile=sys.argv[2], lineterm=''):
    print(line)
