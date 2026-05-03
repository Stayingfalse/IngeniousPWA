# Copilot Repository Instructions

## Version Bumping

Every commit to this repository **must** bump the minor version in `/package.json` by 1.

- The version follows semver: `MAJOR.MINOR.PATCH`
- Increment the **MINOR** segment by 1 for each commit (e.g. `1.1.1` → `1.2.1`, `1.2.1` → `1.3.1`)
- Reset the **PATCH** segment to `0` when incrementing MINOR (e.g. `1.1.5` → `1.2.0`)
- The relevant field is `"version"` at the top level of `/package.json`

Example using pnpm:
```bash
pnpm version minor --no-git-tag-version
```
