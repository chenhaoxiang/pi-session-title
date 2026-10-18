---
doc_type: reference
project: pi-session-title
status: active
truth_mode: maintained
created: 2026-10-18
verified: 2026-10-18
verified_by: manual
---

# Behavior contract

## Request policy

The shipped default is `autoGenerate: false`, `model: null`, and a 15-second request timeout. A normal `turn_end` only installs a local fallback title; it makes no model request. A user command `/title` is the explicit request boundary. When `autoGenerate` is true, the first completed TUI turn in an unnamed session may issue one asynchronous request; the lifecycle handler never awaits it. Automatic attempts are not retried. A persisted fallback prevents further automatic calls, including after resume or reload.

The title model is resolved at request time:

1. `model: null` → the current `ctx.model`.
2. `model: "provider/model"` → that exact registered chat model, only with configured authentication. Model IDs may contain slashes; the first slash separates provider from ID.
3. Missing or unauthenticated models → no model call and local fallback, not another provider.

The extension never changes Pi's active model, default model, thinking level, or credentials. It uses the registry's provider-neutral `streamSimple` and request-time authentication. It does not force a title-specific thinking level. Automatic model requests run only in TUI mode, not RPC/JSON/print; explicitly dispatched `/title` commands are supported by command-capable hosts.

## Input and output

Only user messages on the active branch are collected. Automatic titles describe the first three non-empty user messages; `/title` follows topic changes using the last five. Input is capped at 1500 Unicode code points. Host system prompts, assistant replies, tool results, thinking, images, and other branches are excluded. User text may itself contain sensitive data or URLs: this extension does not redact it. Opt in only to a model/provider you trust for these excerpts.

Model output is reduced to a 20-character title and at most four unique 8-character tags. Local fallback uses the first visible input line, capped at 15 code points, with no tags. Terminal escapes/control characters are removed; this does not constitute sensitive-data redaction. Names are persisted using Pi's ordinary session metadata and appear in `/resume`; the footer status key is `session-title`, capped at 32 characters plus an ellipsis. Existing `/name` titles are mirrored without being renamed by automatic logic.

## Failure and cancellation

Title work is best-effort and isolated from the main agent task. Failure, timeout (default 15s), missing authentication, or invalid configuration retains the existing/fallback name and reports a generic warning without raw provider errors. No background retries occur. The request has a private abort controller, zero provider retries, a 512-token output cap, no prompt-cache retention and an independent request session ID. The wall-clock timeout races the response even if a custom provider ignores abort. A provider may still finish/bill a request already sent; cancellation is not a guarantee of server-side cancellation or zero cost.

Both automatic and manual generation only commit while the active request, session ID and expected name still match. A newer `/name` or `/title <name>` wins. Session switching, forking, tree navigation, reload/shutdown and a configuration change retire in-flight work. Duplicate `/title` requests are rejected while one is active. Manual `/title` may explicitly replace an existing name after success; on failure it keeps it.

## Configuration

`<agent-dir>/session-title.json` is user-level only, not project-controlled, so a repository cannot silently opt users into extra title requests. It contains only `autoGenerate`, `model` and `timeoutMs` (integer 1000–120000). Missing file means defaults; malformed or unreadable files disable model title requests while preserving local fallback. Configuration commands do not overwrite a malformed file: fix it and run `/title-config reload`.

Commands persist through private temporary files and atomic rename. Concurrent Pi processes are last-completed-write-wins, not a multi-process merge transaction. Running sessions load on `session_start`; `/title-config`, `status` or `reload` re-reads the file. Enabling automation never starts a request by itself and never overwrites an existing fallback/name; it affects a future unnamed session/turn.

## Verification

Run `npm run check` and package inspection. Regressions exercise zero-call defaults, request-time current-model selection, explicit model/auth failure without alternate calls, fallback on failure/timeout, non-blocking automatic work, duplicate/rename/session cancellation, bounded user-only input, configuration validation/persistence and real Pi loading with synthetic fixtures. Tests must not use real credentials or providers.
