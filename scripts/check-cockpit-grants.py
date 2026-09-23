from pathlib import Path
import re

sql = Path("supabase/migrations/202609230006_campaign_cockpit.sql").read_text()

# The GRANT syntax contains only argument types; function declarations also
# contain parameter names. Normalize declarations to their type signatures.
def normalize_declaration(args: str) -> str:
    result = []
    for item in args.split(","):
        tokens = item.strip().split()
        if tokens:
            result.append(" ".join(tokens[1:]) if len(tokens) > 1 else tokens[0])
    return ", ".join(result)

functions = {
    name: normalize_declaration(args)
    for name, args in re.findall(
        r"create or replace function public\.(\w+)\((.*?)\)", sql, re.S
    )
}
grants = {
    name: ", ".join(item.strip() for item in args.replace("\n", " ").split(","))
    for name, args in re.findall(
        r"grant execute on function public\.(\w+)\((.*?)\)", sql, re.S
    )
}

for name, granted_signature in grants.items():
    declared_signature = functions.get(name)
    print(f"{name}: {'OK' if declared_signature == granted_signature else 'MISMATCH'}")
    if declared_signature != granted_signature:
        raise SystemExit(
            f"{name}: declaration={declared_signature!r}, grant={granted_signature!r}"
        )
