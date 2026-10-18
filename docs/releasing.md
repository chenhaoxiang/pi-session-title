---
doc_type: runbook
project: pi-session-title
status: active
truth_mode: maintained
created: 2026-10-18
verified: 2026-10-18
verified_by: manual
---

# Release maintenance

This is an original standalone project. Use SemVer, a PR-managed `main`, regular merge commits and immutable `v<version>` tags. Do not invent community upstream/fork relationships or overwrite old tags/assets. The initially empty repository required one empty bootstrap commit; project code goes through PRs.

## Publish each version

1. Use an isolated worktree from the latest remote main. Preserve unrelated dirty work.
2. Update the manifest, lockfile and both README files. Run `npm ci --ignore-scripts`, `npm run check`, `npm audit --omit=dev --audit-level=high` and inspect `npm pack --dry-run --json`. Tests must use only synthetic models and disposable tmp/ directories.
3. Review the exact source/diff and merge the PR normally. Verify remote main contains the validated head.
4. Build at that exact main SHA with `npm pack --ignore-scripts --pack-destination tmp/release`.
5. Write `release-manifest.json` with `schemaVersion: 1`, canonical repository URL, `version`, `tag`, exact 40-hex `sourceCommit`, `package` filename and 64-hex `packageSha256`. Community source fields, if present, are null. Generate `SHA256SUMS` for the tarball and manifest.
6. Create GitHub Release `v<version>` targeting that exact SHA with the package, manifest and checksums. Record PR/test/activation boundaries in release notes. No npm publication is implied.
7. Download all published assets afresh, check `shasum -a 256 -c SHA256SUMS` and the manifest/source binding, extract and repeat isolated real-Pi loading without live model requests.

## Installation and rollback

Use `pi install git:github.com/chenhaoxiang/pi-session-title@v0.0.2`, or extract a verified Release tarball to a permanent versioned user-owned directory and run `pi install /absolute/path/to/package`. A local path is not copied by Pi: keep that directory. Never install a temporary worktree/release directory as the permanent source.

Before migrating a manual `~/.pi/agent/extensions/session-title.ts`, back it up with the pre-switch settings in a private user-owned location and verify byte hashes. Move it outside extension discovery; a different filename inside a discovered directory may still load. Enable only the package. Verify installed source bytes, exactly one title command and no unrelated settings changes. Leave `autoGenerate: false` and `model: null` unless the user requests otherwise.

If installation fails, retain evidence, remove only the new source and restore the previous single source/settings. Retain historical releases and old manual source for rollback. Restart Pi or use `/reload` after updating. Do not force-stop active sessions or claim changed disk files were hot-loaded.

Pinned tags do not advance under `pi update`: install the next explicit tag to upgrade. A deliberate `@main` installation follows a moving branch instead and is not the stable-release default.
