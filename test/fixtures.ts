import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG } from "../src/config.js";
import type { TitleConfig } from "../src/config.js";
import { registerSessionTitle } from "../src/controller.js";

type Handler = (event: any, ctx: ExtensionContext) => unknown;
type Command = Parameters<ExtensionAPI["registerCommand"]>[1];
type Model = NonNullable<ExtensionContext["model"]>;
export const model = (provider = "synthetic", id = "current"): Model => ({
  provider, id, name: id, api: "openai-completions", baseUrl: "https://provider.invalid/v1",
  reasoning: false, input: ["text"], contextWindow: 8192, maxTokens: 1024,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
});
export function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export const response = (text = "Synthetic title\npi,tests", stopReason = "stop") => ({
  content: [{ type: "text", text }], stopReason,
});
export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
export async function fixture(label: string) {
  const root = join(process.cwd(), "tmp", "tests");
  await mkdir(root, { recursive: true });
  return mkdtemp(join(root, label + "-"));
}
export const cleanup = (path: string) => rm(path, { recursive: true, force: true });

export function harness(initial: Partial<TitleConfig> = {}) {
  const events = new Map<string, Handler[]>();
  const commands = new Map<string, Command>();
  const notifications: { message: string; type: string }[] = [];
  const statuses = new Map<string, string | undefined>();
  const calls: { model: Model; context: any; options: any }[] = [];
  const state = {
    name: undefined as string | undefined,
    sessionId: "session-1",
    currentModel: model() as Model | undefined,
    branch: [{ type: "message", message: { role: "user", content: "Fix the title extension", timestamp: 0 } }] as any[],
    available: [model(), model("other", "org/title-model")],
    configuredAuth: true,
    config: { ...DEFAULT_CONFIG, ...initial },
    readError: false,
    writeError: false,
    signal: undefined as AbortSignal | undefined,
    mode: "tui",
    hasUI: true,
    complete: (_call: typeof calls[number]): Promise<any> => Promise.resolve(response()),
  };
  const emit = async (name: string, event: Record<string, unknown> = {}) => {
    for (const handler of events.get(name) ?? []) await handler({ type: name, ...event }, ctx);
  };
  const pi = {
    on(name: string, handler: Handler) { events.set(name, [...(events.get(name) ?? []), handler]); return () => {}; },
    registerCommand(name: string, command: Command) { commands.set(name, command); },
    getSessionName() { return state.name; },
    setSessionName(name: string) {
      state.name = name || undefined;
      state.branch.push({ type: "session_info", id: "name-" + state.branch.length, name: state.name });
      for (const handler of events.get("session_info_changed") ?? []) handler({ name: state.name }, ctx);
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    get model() { return state.currentModel; },
    get mode() { return state.mode; },
    get hasUI() { return state.hasUI; },
    get signal() { return state.signal; },
    sessionManager: {
      getBranch: () => state.branch,
      getSessionId: () => state.sessionId,
    },
    modelRegistry: {
      find: (provider: string, id: string) => state.available.find((m) => m.provider === provider && m.id === id),
      hasConfiguredAuth: () => state.configuredAuth,
      streamSimple(m: Model, context: unknown, options: unknown) {
        const call = { model: m, context, options } as typeof calls[number];
        calls.push(call);
        return { result: () => state.complete(call) };
      },
    },
    ui: {
      notify: (message: string, type = "info") => notifications.push({ message, type }),
      setStatus: (key: string, text: string | undefined) => statuses.set(key, text),
    },
  } as unknown as ExtensionContext;
  const store = {
    read: async () => { if (state.readError) throw new Error("synthetic private error"); return { ...state.config }; },
    write: async (config: TitleConfig) => {
      if (state.writeError) throw new Error("synthetic private error");
      state.config = { ...config };
    },
  };
  registerSessionTitle(pi, store);
  const command = async (name = "title", args = "") => {
    const selected = commands.get(name);
    if (!selected) throw new Error("unknown test command");
    await selected.handler(args, ctx as ExtensionCommandContext);
  };
  return { state, emit, pi, ctx, commands, events, calls, notifications, statuses, command };
}
