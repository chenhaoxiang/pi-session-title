import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { test } from "node:test";
import {
  createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { cleanup, fixture } from "./fixtures.js";

// End-to-end request adapter check. Every HTTP request is served by a disposable loopback fixture.
test("real Pi normal turns stay at one request and /title follows the changed current model", async () => {
  const requests: { model: string; messages: unknown[] }[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    const payload = JSON.parse(body) as typeof requests[number];
    requests.push(payload);
    response.writeHead(200, { "Content-Type": "text/event-stream", Connection: "close" });
    const chunk = {
      id: "fixture", object: "chat.completion.chunk", created: 1, model: payload.model,
      choices: [{ index: 0, delta: { role: "assistant", content: "Native title\npi,test" }, finish_reason: null }],
    };
    response.write("data: " + JSON.stringify(chunk) + "\n\n");
    response.write("data: " + JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) + "\n\n");
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const root = await fixture("native-request");
  const agentDir = join(root, "agent");
  const previous = process.env.PI_CODING_AGENT_DIR;
  try {
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: {
      loopback: {
        api: "openai-completions", baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: "synthetic-only",
        models: ["first", "second"].map((id) => ({ id, reasoning: false, input: ["text"], contextWindow: 8192, maxTokens: 1024 })),
      },
    }}));
    await writeFile(join(agentDir, "auth.json"), "{}");
    process.env.PI_CODING_AGENT_DIR = agentDir;
    const runtime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"),
      modelsStorePath: join(agentDir, "models-store.json"), allowModelNetwork: false,
    });
    const settings = SettingsManager.inMemory({
      defaultProvider: "loopback", defaultModel: "first", cacheWarming: "off", compaction: { enabled: false },
    });
    const loader = new DefaultResourceLoader({
      cwd: root, agentDir, settingsManager: settings, noSkills: true, noThemes: true,
      noContextFiles: true, noPromptTemplates: true, noExtensions: true,
      additionalExtensionPaths: [join(process.cwd(), "src", "session-title.ts")],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const manager = SessionManager.inMemory(root);
    const { session } = await createAgentSession({
      cwd: root, agentDir, modelRuntime: runtime, settingsManager: settings, sessionManager: manager,
      resourceLoader: loader, model: runtime.getModel("loopback", "first"), tools: [],
    });
    const errors: string[] = [];
    try {
      await session.bindExtensions({ mode: "tui", uiContext: {
        notify: () => {}, setStatus: () => {},
      } as unknown as ExtensionUIContext, onError: (error) => errors.push(error.error) });
      await session.prompt("Build a title extension");
      assert.equal(requests.length, 1, "ordinary user run must not trigger an extra title request");
      assert.equal(manager.getSessionName(), "Build a title e");
      await session.setModel(runtime.getModel("loopback", "second")!);
      await session.prompt("/title");
      assert.equal(requests.length, 2);
      assert.equal(requests[1]!.model, "second");
      assert.equal(manager.getSessionName(), "Native title #pi #test");
      assert.equal(session.model?.id, "second");
      assert.deepEqual(errors, []);
      const titlePayload = JSON.stringify(requests[1]!.messages);
      assert.ok(titlePayload.includes("Build a title extension"));
      assert.equal(titlePayload.includes("Native title"), false, "assistant reply is excluded from the title request");
    } finally { session.dispose(); }
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanup(root);
  }
});
