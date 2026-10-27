"""Collect changes/ into VERSIONS.md and README.md. Run from the repo root."""
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from frontmatter import BUMPS, CHANGE_TYPES, entries, read

MARKER = "<!-- NEWEST VERSION BELOW THIS LINE -->"


def latest_version(text):
    found = re.findall(r"^## \[(\d+)\.(\d+)\.(\d+)\]", text, flags=re.M)
    if not found:
        return (0, 0, 0)
    return max(tuple(int(x) for x in v) for v in found)


def bump(version, level):
    major, minor, patch = version
    if level == "major":
        return (major + 1, 0, 0)
    if level == "minor":
        return (major, minor + 1, 0)
    return (major, minor, patch + 1)


def load_changes():
    items, paths, errors = [], [], []
    for p in entries("changes"):
        try:
            meta, body = read(p)
        except ValueError as e:
            errors.append(str(e))
            continue
        if meta.get("type") not in CHANGE_TYPES or meta.get("bump") not in BUMPS or not body:
            errors.append(f"{p}: invalid type, bump or description")
            continue
        items.append(
            {
                "type": meta["type"],
                "bump": meta["bump"],
                "feature": meta.get("feature", "").strip(),
                "text": " ".join(body.split()),
            }
        )
        paths.append(p)
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    return items, paths


def build_section(version, date, items):
    lines = [f"## [{version}] - {date}", ""]
    for t in CHANGE_TYPES:
        group = [i for i in items if i["type"] == t]
        if not group:
            continue
        lines.append(f"### {t}")
        lines.extend(f"- {i['text']}" for i in group)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n\n"


def update_versions(version, date, items):
    path = Path("VERSIONS.md")
    text = path.read_text(encoding="utf-8")
    if MARKER not in text:
        sys.exit(f"VERSIONS.md has no marker line: {MARKER}")
    head, tail = text.split(MARKER, 1)
    path.write_text(
        head + MARKER + "\n\n" + build_section(version, date, items) + tail.lstrip("\n"),
        encoding="utf-8",
    )


def update_readme(version, items):
    features = [i for i in items if i["feature"]]
    if not features:
        return
    path = Path("README.md")
    lines = [
        l for l in path.read_text(encoding="utf-8").split("\n") if "Delete this row" not in l
    ]
    start = next((n for n, l in enumerate(lines) if l.strip() == "## Features"), None)
    if start is None:
        sys.exit("README.md has no '## Features' section")
    last = None
    for n in range(start + 1, len(lines)):
        if lines[n].startswith("## "):
            break
        if lines[n].startswith("|"):
            last = n
    if last is None:
        sys.exit("README.md has no table in the Features section")
    rows = [
        f"| {f['feature'].replace('|', '/')} | {version} | {f['text'].replace('|', '/')} |"
        for f in features
    ]
    lines[last + 1:last + 1] = rows
    path.write_text("\n".join(lines), encoding="utf-8")


def remove_done_status():
    for p in entries("status"):
        try:
            meta, _ = read(p)
        except ValueError:
            continue
        if meta.get("state") == "Done":
            p.unlink()


def main():
    items, paths = load_changes()
    if not items:
        print("No files in changes/. Nothing to release.")
        return
    current = latest_version(Path("VERSIONS.md").read_text(encoding="utf-8"))
    level = max((i["bump"] for i in items), key=BUMPS.index)
    new = ".".join(str(x) for x in bump(current, level))
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    update_versions(new, date, items)
    update_readme(new, items)
    for p in paths:
        p.unlink()
    remove_done_status()

    print(f"Prepared release {new} ({len(items)} changes, bump: {level})")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"version={new}\n")


if __name__ == "__main__":
    main()
