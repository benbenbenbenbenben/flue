---
name: release

description: Release public npm packages from this repository. Use ONLY when the user explicitly asks to release and supplies patch, minor, major, or an explicit version number.
---

# Release

Perform a release only when the user has explicitly provided one of: `patch`, `minor`, `major`, or an explicit version number. If missing, ask for it and stop.

## Versioning

This project uses pre-1.0 semver semantics:

- `patch`: non-breaking changes. Increment `0.x.y` to `0.x.(y+1)`.
- `minor`: breaking changes. Increment `0.x.y` to `0.(x+1).0`.
- `major`: use only when explicitly requested; increment the major version normally.
- Explicit version: use exactly the provided version after confirming it is a valid semver version.

Before editing, inspect all workspace `package.json` files. Change versions only for public packages (`private` is not `true`). Keep public Flue package versions aligned to the selected release version unless the user explicitly directs otherwise. Do not version or publish private packages.

## Workflow

1. Confirm the repository is on the intended current branch, determine the selected release version, and check the working tree. If unrelated changes exist, stop and ask before including them in the release commit.
2. Update the `version` field in each public package `package.json` to the selected release version.
3. Run `pnpm install --lockfile-only` if necessary to update version-related lockfile metadata.
4. Rebuild from scratch: remove generated build outputs for public packages, then run the repository build command (`pnpm run build` from the repository root).
5. Run repository validation before publishing: `pnpm run check` from the repository root.
6. Publish each public package from its package directory using `pnpm publish -r --no-git-checks`. Publish in dependency order when required (for this repository, publish `@flue/runtime` before packages that depend on it).
7. Inspect the final diff and stage only release-generated changes, including package versions, lockfile updates, and build or prepublish-generated tracked files.
8. Commit after publication with `git commit -m "chore: release v<VERSION>"`.
9. Tag that final commit with `git tag v<VERSION>`.
10. Push the current branch, then push the tag: `git push` followed by `git push --tags`.

## Guardrails

- Do not begin without an explicitly stated release increment or version.
- Never use a normal `pnpm publish`; always include `-r --no-git-checks` because publishing occurs from an intentionally unclean release tree before the commit.
- Never commit unrelated pre-existing work.
- Never create the tag until publishing and the release commit both succeed.
- If publish fails partway through, stop and report which packages published; do not tag or push.
- If verification, commit, tag, or push fails, stop and report the failure rather than changing the requested version.
