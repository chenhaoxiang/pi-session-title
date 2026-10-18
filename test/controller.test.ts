import assert from "node:assert/strict";
import { test } from "node:test";
import { deferred, flush, harness, model, response } from "./fixtures.js";

// Contract: routine session activity and configuration must never make a model call by default.
test("default lifecycle creates an offline fallback and footer with zero title requests", async () => {
  const h = harness();
  await h.emit("session_start");
  assert.equal(h.state.name, undefined);
  assert.equal(h.statuses.get("session-title"), undefined);
  await h.emit("turn_end");
  assert.equal(h.state.name, "Fix the title e");
  assert.equal(h.statuses.get("session-title"), h.state.name);
  for (let i = 0; i < 10; i++) await h.emit("turn_end");
  await h.command("title-config");
  assert.equal(h.calls.length, 0);
  assert.match(h.notifications.at(-1)!.message, /autoGenerate=false, model=current session/u);
});

test("/title resolves the actual current model at invocation, including later model changes", async () => {
  const h = harness();
  await h.emit("session_start");
  h.state.currentModel = model("fresh-provider", "changed-model");
  const current = h.state.currentModel;
  await h.command();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0]!.model, current);
  assert.equal(h.state.currentModel, current);
  assert.equal(h.state.name, "Synthetic title #pi #tests");
  assert.equal(h.calls[0]!.options.cacheRetention, "none");
  assert.equal(h.calls[0]!.options.maxRetries, 0);
  assert.ok(h.calls[0]!.options.signal instanceof AbortSignal);
  await h.command();
  assert.equal(h.calls.length, 2);
  assert.notEqual(h.calls[0]!.options.sessionId, h.calls[1]!.options.sessionId);
});

test("/title may explicitly regenerate an existing name", async () => {
  const h = harness();
  h.state.name = "Old topic";
  await h.emit("session_start");
  await h.command();
  assert.equal(h.state.name, "Synthetic title #pi #tests");
});

test("the exact configured model is selected, including slashes in its model ID", async () => {
  const h = harness({ model: "other/org/title-model" });
  await h.emit("session_start");
  await h.command();
  assert.equal(h.calls[0]!.model.provider, "other");
  assert.equal(h.calls[0]!.model.id, "org/title-model");
  assert.equal(h.state.currentModel?.provider, "synthetic");
});

for (const scenario of ["missing-selected", "no-auth", "no-current"] as const) {
  test(`model unavailable (${scenario}) stays offline with fallback instead of calling an alternate provider`, async () => {
    const h = harness(scenario === "missing-selected" ? { model: "missing/model" } : {});
    if (scenario === "no-auth") h.state.configuredAuth = false;
    if (scenario === "no-current") h.state.currentModel = undefined;
    await h.emit("session_start");
    await h.command();
    assert.equal(h.calls.length, 0);
    assert.equal(h.state.name, "Fix the title e");
    assert.equal(h.notifications.at(-1)!.type, "warning");
    assert.match(h.notifications.at(-1)!.message, /model-unavailable/u);
    assert.deepEqual(h.diagnostics, [{ type: "session-title-failure", data: {
      schemaVersion: 1, reason: "model-unavailable", automatic: false,
    } }]);
  });
}

for (const scenario of ["throw", "error-response", "empty", "aborted-response"] as const) {
  test(`generation failure (${scenario}) keeps fallback and never prints raw provider errors`, async () => {
    const h = harness();
    h.state.complete = async () => {
      if (scenario === "throw") throw new Error("synthetic-secret https://private.invalid");
      if (scenario === "empty") return response(" ");
      return response("untrusted error content", scenario === "error-response" ? "error" : "aborted");
    };
    await h.emit("session_start");
    await h.command();
    assert.equal(h.state.name, "Fix the title e");
    assert.equal(h.calls.length, 1);
    assert.ok(h.notifications.every(({ message }) => !/synthetic-secret|private.invalid|untrusted/u.test(message)));
    const expectedReason = scenario === "empty" ? "empty-output" : "provider-error";
    assert.match(h.notifications.at(-1)!.message, new RegExp(expectedReason));
    assert.deepEqual(h.diagnostics, [{ type: "session-title-failure", data: {
      schemaVersion: 1, reason: expectedReason, automatic: false,
    } }]);
    await h.emit("turn_end");
    assert.equal(h.calls.length, 1);
  });
}

test("failed explicit refresh retains an existing custom title", async () => {
  const h = harness();
  h.state.name = "Keep this name";
  h.state.complete = async () => { throw new Error("private"); };
  await h.emit("session_start");
  await h.command();
  assert.equal(h.state.name, "Keep this name");
});

test("manual /title <name> uses no model and synchronizes the footer", async () => {
  const h = harness();
  await h.emit("session_start");
  await h.command("title", "My custom title");
  await h.emit("turn_end");
  assert.equal(h.calls.length, 0);
  assert.equal(h.state.name, "My custom title");
  assert.equal(h.statuses.get("session-title"), "My custom title");
});

test("no text and image-only messages do not consume automatic generation or call a model", async () => {
  const h = harness({ autoGenerate: true });
  h.state.branch = [{ type: "message", message: { role: "user", content: [{ type: "image", data: "private" }] } }];
  await h.emit("session_start");
  await h.emit("turn_end");
  await h.command();
  assert.equal(h.calls.length, 0);
  assert.equal(h.state.name, undefined);
  h.state.branch.push({ type: "message", message: { role: "user", content: "Text arrives" } });
  await h.emit("turn_end");
  await flush();
  assert.equal(h.calls.length, 1);
});

test("opt-in automatic work returns before a slow response and only attempts once", async () => {
  const h = harness({ autoGenerate: true });
  const wait = deferred();
  h.state.complete = () => wait.promise;
  await h.emit("session_start");
  await h.emit("turn_end"); // Must not wait for wait.promise.
  assert.equal(h.calls.length, 1);
  assert.equal(h.state.name, "Fix the title e");
  await h.emit("turn_end");
  assert.equal(h.calls.length, 1);
  wait.resolve(response());
  await flush();
  assert.equal(h.state.name, "Synthetic title #pi #tests");
  await h.emit("turn_end");
  await h.emit("session_start", { reason: "reload" });
  await h.emit("turn_end");
  assert.equal(h.calls.length, 1);
});

test("automatic failure retains fallback and does not retry on later turns/reload", async () => {
  const h = harness({ autoGenerate: true });
  h.state.complete = async () => { throw new Error("private"); };
  await h.emit("session_start");
  await h.emit("turn_end");
  await flush();
  assert.equal(h.state.name, "Fix the title e");
  assert.deepEqual(h.diagnostics, [{ type: "session-title-failure", data: {
    schemaVersion: 1, reason: "provider-error", automatic: true,
  } }]);
  await h.emit("turn_end");
  await h.emit("session_start", { reason: "reload" });
  await h.emit("turn_end");
  assert.equal(h.calls.length, 1);
});

for (const mode of ["rpc", "json", "print"]) {
  test(`opt-in auto is not invoked in ${mode} mode`, async () => {
    const h = harness({ autoGenerate: true });
    h.state.mode = mode;
    await h.emit("session_start");
    await h.emit("turn_end");
    assert.equal(h.calls.length, 0);
    assert.equal(h.state.name, "Fix the title e");
  });
}

test("pre-existing /name title prevents all automatic model work and is restored in footer", async () => {
  const h = harness({ autoGenerate: true });
  h.state.name = "Existing title";
  await h.emit("session_start");
  await h.emit("turn_end");
  assert.equal(h.calls.length, 0);
  assert.equal(h.statuses.get("session-title"), "Existing title");
  h.pi.setSessionName("New /name title");
  assert.equal(h.statuses.get("session-title"), "New /name title");
  h.pi.setSessionName("");
  assert.equal(h.statuses.get("session-title"), undefined);
});

for (const command of ["/name", "/title"] as const) {
  test(`newer manual name via ${command} cancels in-flight generation, even if a provider ignores abort`, async () => {
    const h = harness({ autoGenerate: true });
    const wait = deferred();
    h.state.complete = () => wait.promise;
    await h.emit("session_start");
    await h.emit("turn_end");
    if (command === "/name") h.pi.setSessionName("User wins");
    else await h.command("title", "User wins");
    assert.equal(h.calls[0]!.options.signal.aborted, true);
    wait.resolve(response("Stale title\nstale"));
    await flush();
    assert.equal(h.state.name, "User wins");
    assert.deepEqual(h.diagnostics, [], "cancelled requests are not failures");
  });
}

for (const event of ["session_before_switch", "session_before_fork", "session_before_tree", "session_shutdown", "session_start"]) {
  test(`${event} retires an in-flight manual result without changing newer metadata`, async () => {
    const h = harness();
    const wait = deferred();
    h.state.complete = () => wait.promise;
    await h.emit("session_start");
    const command = h.command();
    assert.equal(h.calls.length, 1);
    await h.emit(event);
    h.state.sessionId = "different-session";
    h.state.name = "Other session";
    wait.resolve(response("Stale title\nstale"));
    await command;
    assert.equal(h.calls[0]!.options.signal.aborted, true);
    assert.equal(h.state.name, "Other session");
    assert.deepEqual(h.diagnostics, [], "retired sessions must not receive diagnostics");
  });
}

test("reapplying the same manual name still retires an in-flight request by metadata revision", async () => {
  const h = harness();
  const wait = deferred();
  h.state.complete = () => wait.promise;
  await h.emit("session_start");
  const command = h.command();
  const fallback = h.state.name!;
  h.pi.setSessionName(fallback);
  wait.resolve(response("Should not replace\\nold"));
  await command;
  assert.equal(h.calls[0]!.options.signal.aborted, true);
  assert.equal(h.state.name, fallback);
});

test("parent cancellation never aborts the main task or commits a late title", async () => {
  const h = harness();
  const parent = new AbortController();
  h.state.signal = parent.signal;
  const wait = deferred();
  h.state.complete = () => wait.promise;
  await h.emit("session_start");
  const command = h.command();
  parent.abort();
  await command;
  wait.resolve(response());
  await flush();
  assert.equal(h.calls[0]!.options.signal.aborted, true);
  assert.equal(h.state.name, "Fix the title e");
  assert.deepEqual(h.diagnostics, [], "parent cancellation is not a title failure");
});

test("optional title UI failures do not reject normal turn processing", async () => {
  const h = harness();
  h.ctx.ui.setStatus = () => { throw new Error("render error"); };
  h.ctx.ui.notify = () => { throw new Error("notification error"); };
  await h.emit("session_start");
  await h.emit("turn_end");
  assert.equal(h.calls.length, 0);
  assert.equal(h.state.name, "Fix the title e");
});

test("session ID mismatch discards even without a lifecycle cancellation event", async () => {
  const h = harness();
  const wait = deferred();
  h.state.complete = () => wait.promise;
  await h.emit("session_start");
  const command = h.command();
  h.state.sessionId = "different-session";
  h.state.name = undefined;
  wait.resolve(response());
  await command;
  assert.equal(h.state.name, undefined);
});

test("concurrent /title calls share no state and do not duplicate the in-flight request", async () => {
  const h = harness();
  const wait = deferred();
  h.state.complete = () => wait.promise;
  await h.emit("session_start");
  const first = h.command();
  await h.command();
  assert.equal(h.calls.length, 1);
  assert.match(h.notifications.at(-1)!.message, /already running/u);
  wait.resolve(response());
  await first;
});

test("wall-clock timeout releases /title even if a provider never settles or honors abort", async () => {
  const h = harness({ timeoutMs: 1000 });
  const wait = deferred();
  h.state.complete = () => wait.promise;
  await h.emit("session_start");
  await h.command();
  assert.equal(h.calls[0]!.options.signal.aborted, true);
  assert.equal(h.state.name, "Fix the title e");
  assert.match(h.notifications.at(-1)!.message, /timed out/u);
  assert.deepEqual(h.diagnostics, [{ type: "session-title-failure", data: {
    schemaVersion: 1, reason: "timeout", automatic: false,
  } }]);
  // The timed-out promise can resolve late, but it cannot overwrite metadata.
  h.pi.setSessionName("After timeout");
  wait.resolve(response());
  await flush();
  assert.equal(h.state.name, "After timeout");
});

test("diagnostic write failure cannot reject a title command or expose raw errors", async () => {
  const h = harness();
  h.pi.appendEntry = () => { throw new Error("private persistence error"); };
  h.state.complete = async () => { throw new Error("private provider error"); };
  await h.emit("session_start");
  await h.command();
  assert.equal(h.state.name, "Fix the title e");
  assert.match(h.notifications.at(-1)!.message, /provider-error/u);
  assert.ok(h.notifications.every(({ message }) => !message.includes("private")));
});

test("title payload contains only bounded user text, never host prompts/assistant/tools/images", async () => {
  const h = harness();
  h.state.branch = [
    { type: "message", message: { role: "assistant", content: "PRIVATE ASSISTANT" } },
    { type: "message", message: { role: "toolResult", content: "PRIVATE TOOL" } },
    { type: "custom", data: "PRIVATE CUSTOM" },
    ...Array.from({ length: 7 }, (_, i) => ({ type: "message", message: { role: "user", content: [
      { type: "text", text: "user-" + i + ":" + "😀".repeat(400) },
      { type: "image", data: "PRIVATE IMAGE" },
    ] } })),
  ];
  await h.emit("session_start");
  await h.command();
  const payload = h.calls[0]!.context;
  const input = payload.messages[0].content[0].text as string;
  assert.equal([...input].length, 1500);
  assert.ok(input.startsWith("user-2:"));
  assert.ok(!input.includes("user-0:"));
  assert.ok(!JSON.stringify(payload).includes("PRIVATE"));
  assert.equal(payload.messages.length, 1);
});

test("config commands persist auto/model while never invoking a model, and current restores dynamic selection", async () => {
  const h = harness();
  await h.emit("session_start");
  await h.command("title-config", "auto on");
  assert.equal(h.state.config.autoGenerate, true);
  await h.command("title-config", "model other/org/title-model");
  assert.equal(h.state.config.model, "other/org/title-model");
  await h.command("title-config", "model current");
  assert.equal(h.state.config.model, null);
  await h.command("title-config", "auto off");
  assert.equal(h.state.config.autoGenerate, false);
  await h.command("title-config", "model missing/model");
  assert.equal(h.state.config.model, null);
  assert.equal(h.calls.length, 0);
});

test("malformed model arguments preserve healthy settings and an outstanding title request", async () => {
  const h = harness({ model: "other/org/title-model" });
  const wait = deferred();
  h.state.complete = () => wait.promise;
  await h.emit("session_start");
  const command = h.command();
  await h.command("title-config", "model typo");
  assert.equal(h.state.config.model, "other/org/title-model");
  assert.equal(h.calls[0]!.options.signal.aborted, false);
  assert.match(h.notifications.at(-1)!.message, /exact provider\/model/u);
  wait.resolve(response());
  await command;
  assert.equal(h.state.name, "Synthetic title #pi #tests");
  await h.command();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1]!.model.provider, "other");
  assert.equal(h.calls[1]!.model.id, "org/title-model");
});

test("disabling auto cancels its outstanding request; the fallback remains", async () => {
  const h = harness({ autoGenerate: true });
  const wait = deferred();
  h.state.complete = () => wait.promise;
  await h.emit("session_start");
  await h.emit("turn_end");
  await h.command("title-config", "auto off");
  wait.resolve(response());
  await flush();
  assert.equal(h.calls[0]!.options.signal.aborted, true);
  assert.equal(h.state.name, "Fix the title e");
});

test("unreadable config disables requests but preserves fallback and can recover via reload", async () => {
  const h = harness({ autoGenerate: true });
  h.state.readError = true;
  await h.emit("session_start");
  await h.emit("turn_end");
  await h.command();
  assert.equal(h.calls.length, 0);
  assert.equal(h.state.name, "Fix the title e");
  assert.match(h.notifications.at(-1)!.message, /configuration/u);
  h.state.readError = false;
  await h.command("title-config", "reload");
  await h.command();
  assert.equal(h.calls.length, 1);
  assert.ok(h.notifications.every(({ message }) => !message.includes("synthetic private")));
});

test("failed config writes preserve disk settings, report a generic warning and disable further model calls", async () => {
  const h = harness();
  await h.emit("session_start");
  h.state.writeError = true;
  await h.command("title-config", "auto on");
  assert.equal(h.state.config.autoGenerate, false);
  await h.command();
  assert.equal(h.calls.length, 0);
  assert.ok(h.notifications.every(({ message }) => !message.includes("synthetic private")));
  assert.match(h.notifications.at(-1)!.message, /configuration/u);
});
