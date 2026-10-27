import re
import subprocess
import sys

from frontmatter import BUMPS, CHANGE_TYPES, STATES, entries, read


def check_changes():
    errors = []
    for p in entries("changes"):
        try:
            meta, body = read(p)
        except ValueError as e:
            errors.append(str(e))
            continue
        if meta.get("type") not in CHANGE_TYPES:
            errors.append(f"{p}: type must be one of {', '.join(CHANGE_TYPES)}")
        if meta.get("bump") not in BUMPS:
            errors.append(f"{p}: bump must be one of {', '.join(BUMPS)}")
        if not body:
            errors.append(f"{p}: the description is empty")
    return errors


def check_status():
    errors = []
    for p in entries("status"):
        try:
            meta, _ = read(p)
        except ValueError as e:
            errors.append(str(e))
            continue
        for key in ("task", "who", "state", "branch", "files", "updated"):
            if not meta.get(key):
                errors.append(f"{p}: missing '{key}'")
        if meta.get("state") and meta["state"] not in STATES:
            errors.append(f"{p}: state must be one of {', '.join(STATES)}")
        if meta.get("updated") and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["updated"]):
            errors.append(f"{p}: updated must look like YYYY-MM-DD")
    return errors


def require_new(base):
    out = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=AM", f"origin/{base}...HEAD"],
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        return [f"git diff failed: {out.stderr.strip()}"]
    new = [
        line
        for line in out.stdout.splitlines()
        if re.fullmatch(r"changes/[^/_][^/]*\.md", line) and line.lower() != "changes/readme.md"
    ]
    if not new:
        return ["This pull request adds no file in changes/. Copy changes/_TEMPLATE.md and fill it in."]
    return []


def main():
    errors = check_changes() + check_status()
    if len(sys.argv) == 3 and sys.argv[1] == "--require-new":
        errors += require_new(sys.argv[2])
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    print("front matter OK")


if __name__ == "__main__":
    main()
