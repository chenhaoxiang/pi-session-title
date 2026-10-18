# pi-session-title

English | [中文](README.zh-CN.md)

A small Pi extension that gives sessions useful names without silently choosing a second model.

## Behavior

- **Default model:** `/title` uses the model active in the current session at the moment the command runs.
- **No hidden provider:** configure an exact `provider/model` only when you intentionally want another model. If it is unavailable or unauthenticated, the extension does not silently switch providers; it keeps or creates a local fallback title.
- **Zero default model calls:** the default is `autoGenerate: false`. A local fallback title is cheap and offline; no title-model request is made unless you run `/title`.
- **Opt-in automatic generation (TUI only):** set `autoGenerate: true` to allow one best-effort title request after the first completed turn of an unnamed session. The request is fire-and-forget and cannot delay or fail the main task. The local fallback is installed first and a successful result may replace it.
- **Fallback is always retained:** if there is no usable model, the request fails, times out, or the session changes, the local title remains. Automatic work never overwrites a manual name; an explicit `/title` can regenerate one.
- **Privacy boundary:** only user message text is sent to the configured title model, truncated to 1500 characters. Host system prompts, assistant output, tool output, thinking and images are excluded. User text is not redacted and can itself contain secrets or URLs; only use a provider you trust for these excerpts.
- **Footer:** the session name is mirrored in the `session-title` status item when the host supports it.

A running Pi session does not hot-load a changed package. Restart Pi or use `/reload` after an installation/update; the current session may need to be restarted if the old extension runtime is still active.

## Requirements

- Pi 1.3.0 or newer (the package uses Pi's public extension API).
- Node.js 22.19 or newer, as required by Pi.
- A configured Pi chat model only when you use `/title` or opt in to automatic generation.

## Install

Install the immutable GitHub release:

```sh
pi install git:github.com/chenhaoxiang/pi-session-title@v0.0.1
```

Inspect the selected package:

```sh
pi list
```

For local development or offline verification:

```sh
pi install /absolute/path/to/pi-session-title
```

Use either the package or a manually copied `~/.pi/agent/extensions/session-title.ts`, never both. If migrating from the old manual file, move it outside Pi's extension discovery directory before installing the package.

GitHub Releases include an installable tarball, exact-source manifest and SHA-256 checksums. Verify downloaded assets before installing. This release is not published to npm. See [release maintenance](docs/releasing.md) and the [behavior contract](docs/behavior.md).

## Commands

```text
/title                         Generate a title with the configured/current model
/title <name>                  Set an explicit name; no model request
/title-config                  Show saved configuration; no model request
/title-config auto on|off      Enable/disable opt-in automatic generation
/title-config model current    Use the current session model (default)
/title-config model p/m        Use exact provider/model p/m
/title-config reload           Re-read the config file; no model request
```

`/title-config` stores settings at `<agent-dir>/session-title.json`, normally `~/.pi/agent/session-title.json`:

```json
{
  "autoGenerate": false,
  "model": null,
  "timeoutMs": 15000
}
```

`model: null` means the current session model. `model` otherwise accepts an exact `provider/model` from Pi’s existing registry (for example, `openai/gpt-4.1-mini`). No credentials are stored here. Configuration commands themselves never call a model. Enabling automation affects a future unnamed session, not an existing fallback/name.

`timeoutMs` is bounded to 1000–120000 milliseconds. It is included for explicit configuration-file users; the command intentionally only changes model selection and automatic-generation policy.

To update a package already installed from GitHub:

```sh
pi update git:github.com/chenhaoxiang/pi-session-title@v0.0.1
```

This reconciles the pinned tag; it does not advance it. To upgrade to a future version, install its explicit new tag. Use `@main` only if you deliberately want a moving development branch. Do not overwrite `v0.0.1` assets.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm pack --dry-run --json
```

Tests use synthetic model responses and disposable in-memory/fake contexts. They do not call real providers or edit machine-wide Pi settings.

## License

MIT
