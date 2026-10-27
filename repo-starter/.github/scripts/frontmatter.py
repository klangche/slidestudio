"""Tiny front matter reader. No dependencies."""
from pathlib import Path

CHANGE_TYPES = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"]
BUMPS = ["patch", "minor", "major"]
STATES = ["In progress", "Blocked", "Done"]


def read(path):
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"{path}: file must start with '---'")
    meta = {}
    end = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end = i
            break
        if not line.strip():
            continue
        if ":" not in line:
            raise ValueError(f"{path}: line {i + 1} is not 'key: value'")
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip()
    if end is None:
        raise ValueError(f"{path}: front matter is not closed with '---'")
    body = "\n".join(lines[end + 1:]).strip()
    return meta, body


def entries(folder):
    """Real entries in a folder. Skips templates (_*) and README.md."""
    for p in sorted(Path(folder).glob("*.md")):
        if p.name.startswith("_") or p.name.lower() == "readme.md":
            continue
        yield p
