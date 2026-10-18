# Project guidance

This is an original, standalone Pi extension. Work in an isolated worktree; the canonical checkout is read-only except for safe synchronization to verified remote main. Main accepts implementation changes through PRs with ordinary merge commits. Use SemVer and immutable v<version> tags.

Default behavior must issue zero model requests: local fallback names and footer updates only. The current session model is resolved at request time, never from startup defaults. Only /title, or a user-enabled autoGenerate option, may invoke the title model. Explicit title-model failures must not silently call another provider. Do not change the main session model or thinking level.

Title requests must be bounded, cancellable, and non-blocking for lifecycle handlers. Preserve newer manual names and discard results after session/branch changes or reload/shutdown. Automated tests use synthetic messages/models and disposable tmp/ agent directories, never real credentials or live providers. Do not install both the old manual extension and this package.

Run npm run check and inspect npm pack --dry-run --json before release. Publish a GitHub Release with an installable tarball, exact-source manifest and SHA256SUMS; verify a fresh download before local installation. A GitHub Release does not imply npm publication or hot-loading existing sessions.

## Documentation map

- README.md / README.zh-CN.md: installation, commands, configuration, privacy, and activation boundaries.
- docs/behavior.md: v0.0.1 behavior, default/opt-in rules, cancellation and verification contract.
- docs/releasing.md: PR, immutable release assets, verified installation and rollback.
- src/: extension, controller, text handling and user-level configuration.
- test/: provider-free regressions and isolated real-Pi loader integration.
