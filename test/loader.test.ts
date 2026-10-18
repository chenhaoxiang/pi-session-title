import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { cleanup, fixture } from "./fixtures.js";

// Real host check: package entry loads through Pi's resource loader and commands work without a live provider.
test("the published extension entry registers in a real Pi session without a title-model request", async () => {
  const root = await fixture("loader");
  const agentDir = join(root, "agent");
  const previous = process.env.PI_CODING_AGENT_DIR;
  try {
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: {
      synthetic: {
        api: "openai-completions", baseUrl: "https://provider.invalid/v1", apiKey: "synthetic-only",
        models: [{ id: "current", name: "Synthetic current", reasoning: false, input: ["text"], contextWindow: 8192, maxTokens: 128 }],
      },
    }}));
    await writeFile(join(agentDir, "auth.json"), "{}");
    process.env.PI_CODING_AGENT_DIR = agentDir;
    const runtime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"),
      modelsStorePath: join(agentDir, "models-store.json"), allowModelNetwork: false,
    });
    const settings = SettingsManager.inMemory({ defaultProvider: "synthetic", defaultModel: "current", cacheWarming: "off" });
    const source = join(process.cwd(), "src", "session-title.ts");
    const loader = new DefaultResourceLoader({
      cwd: root, agentDir, settingsManager: settings, noSkills: true, noThemes: true,
      noContextFiles: true, noPromptTemplates: true, noExtensions: true, additionalExtensionPaths: [source],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const manager = SessionManager.inMemory(root);
    const { session } = await createAgentSession({
      cwd: root, agentDir, modelRuntime: runtime, settingsManager: settings,
      sessionManager: manager, resourceLoader: loader, model: runtime.getModel("synthetic", "current"), tools: [],
    });
    const notifications: string[] = [];
    try {
      await session.bindExtensions({
        mode: "tui",
        uiContext: {
          notify: (message: string) => notifications.push(message),
          confirm: async () => true,
          setStatus: () => {},
        } as unknown as ExtensionUIContext,
        onError: (error) => { throw new Error(error.error); },
      });
      const commands = loader.getExtensions().extensions.flatMap((extension) => [...extension.commands.keys()]);
      assert.equal(commands.filter((name) => name === "title").length, 1);
      assert.equal(commands.filter((name) => name === "title-config").length, 1);
      await session.prompt("/title-config status");
      await session.prompt("/title A local title");
      assert.equal(manager.getSessionName(), "A local title");
      assert.ok(notifications.some((message) => message.includes("autoGenerate=false")));
      assert.equal(notifications.some((message) => message.includes("Generating session title")), false);
    } finally { session.dispose(); }
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await cleanup(root);
  }
});
