import csv
import sys

with open("languages.csv", newline="", encoding="utf-8") as f:
    rows = list(csv.reader(f))

errors = []

if not rows:
    print("languages.csv is empty")
    sys.exit(1)

header = rows[0]
if header[:2] != ["key", "en"]:
    errors.append("Header must start with: key,en")
if len(set(header)) != len(header):
    errors.append("Duplicate column names in header")

seen = set()
for line_no, row in enumerate(rows[1:], start=2):
    if not row or all(cell.strip() == "" for cell in row):
        continue
    if len(row) != len(header):
        errors.append(f"Line {line_no}: expected {len(header)} columns, found {len(row)}")
        continue
    key, en = row[0].strip(), row[1].strip()
    if not key:
        errors.append(f"Line {line_no}: empty key")
    elif key in seen:
        errors.append(f"Line {line_no}: duplicate key '{key}'")
    seen.add(key)
    if not en:
        errors.append(f"Line {line_no}: the English text for '{key}' is empty")

if errors:
    print("\n".join(errors))
    sys.exit(1)

print(f"languages.csv OK ({len(seen)} keys, {len(header) - 1} languages)")
