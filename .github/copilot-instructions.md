# Copilot Repository Instructions

## Version Bumping

Every commit to this repository **must** bump the version in `/package.json` using semver rules. Choose the bump level based on what was changed:

| Change type | Bump | Example |
|---|---|---|
| Small/trivial change (typo fix, style tweak, config change, removing a widget, minor refactor) | **PATCH** | `1.2.3` → `1.2.4` |
| New feature, new capability, or meaningful behaviour change | **MINOR** (reset PATCH to 0) | `1.2.3` → `1.3.0` |
| Rewrite, overhaul, breaking change, or major architectural change | **MAJOR** (reset MINOR and PATCH to 0) | `1.2.3` → `2.0.0` |

- The relevant field is `"version"` at the top level of `/package.json`
- When in doubt, choose the **lower** bump level

Examples using pnpm:
```bash
# Patch bump (small fix or tweak)
pnpm version patch --no-git-tag-version

# Minor bump (new feature)
pnpm version minor --no-git-tag-version

# Major bump (rewrite / breaking change)
pnpm version major --no-git-tag-version
```
