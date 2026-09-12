from pathlib import Path

root = Path(__file__).resolve().parents[1]
workflow_dir = root / '.github' / 'workflows'
obsolete = workflow_dir / 'p1-02-03-studio-flow.yml'

replacements = {
    'actions/checkout@v4': 'actions/checkout@v7',
    'actions/setup-node@v4': 'actions/setup-node@v7',
    'actions/upload-artifact@v4': 'actions/upload-artifact@v7',
}

changed = []
for file in sorted([*workflow_dir.glob('*.yml'), *workflow_dir.glob('*.yaml')]):
    if file == obsolete:
        continue
    text = file.read_text(encoding='utf-8')
    updated = text
    for old, new in replacements.items():
        updated = updated.replace(old, new)
    if updated != text:
        file.write_text(updated, encoding='utf-8')
        changed.append(str(file.relative_to(root)))

if obsolete.exists():
    obsolete.unlink()
    changed.append(str(obsolete.relative_to(root)) + ' [retired]')

remaining = []
for file in sorted([*workflow_dir.glob('*.yml'), *workflow_dir.glob('*.yaml')]):
    text = file.read_text(encoding='utf-8')
    for old in replacements:
        if old in text:
            remaining.append(f'{file.relative_to(root)}: {old}')
if remaining:
    raise SystemExit('legacy Actions runtime references remain:\n' + '\n'.join(remaining))

print('P1-14 Actions runtime patch complete')
for item in changed:
    print(' -', item)
