#!/usr/bin/env python3
import re, sys, json
from pathlib import Path

if len(sys.argv) < 2:
    print("Usage: prd_inventory.py <prd.md>")
    sys.exit(1)

path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
lines = text.splitlines()
headings = [line.strip('# ').strip() for line in lines if re.match(r'^#{1,6}\s+', line)]
paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
keywords = {
    'goals': [p for p in paragraphs if re.search(r'\b(goal|objective|success)\b', p, re.I)],
    'non_goals': [p for p in paragraphs if re.search(r'non-goal|out of scope', p, re.I)],
    'requirements': [p for p in paragraphs if re.search(r'\brequirement|must|should|shall\b', p, re.I)],
    'risks': [p for p in paragraphs if re.search(r'\brisk|concern|constraint|dependency\b', p, re.I)],
}
summary = {
    'file': str(path),
    'title': headings[0] if headings else path.stem,
    'heading_count': len(headings),
    'headings': headings,
    'sections': {k: len(v) for k, v in keywords.items()},
}
print(json.dumps(summary, indent=2))
