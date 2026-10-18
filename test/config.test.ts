import assert from "node:assert/strict";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_CONFIG, FileConfigStore, parseConfig } from "../src/config.js";
import { cleanup, fixture } from "./fixtures.js";

test("missing config supplies current model and auto off without writing anything", async () => {
  const root = await fixture("config-default");
  try {
    assert.deepEqual(await new FileConfigStore(join(root, "session-title.json")).read(), DEFAULT_CONFIG);
    assert.deepEqual(await readdir(root), []);
  } finally { await cleanup(root); }
});

test("explicit title configuration round-trips atomically using a private file", async () => {
  const root = await fixture("config-write");
  try {
    const path = join(root, "nested", "session-title.json");
    const store = new FileConfigStore(path);
    const config = { autoGenerate: true, model: "provider/org/title-model", timeoutMs: 2000 };
    await store.write(config);
    assert.deepEqual(await store.read(), config);
    await store.write({ ...DEFAULT_CONFIG });
    assert.deepEqual(await store.read(), DEFAULT_CONFIG);
    assert.deepEqual(await readdir(join(root, "nested")), ["session-title.json"]);
    if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o777, 0o600);
    const bytes = await readFile(path, "utf8");
    assert.equal(bytes.includes("secret"), false);
  } finally { await cleanup(root); }
});

for (const value of [null, [], true, "text", { autoGenerate: "true" }, { model: "model-only" },
  { model: "provider/" }, { model: "provider/model with space" }, { timeoutMs: 999 },
  { timeoutMs: 120001 }, { timeoutMs: 1.5 }, { autoGenerate: true, unknown: true }]) {
  test(`invalid configuration is rejected: ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseConfig(value));
  });
}

test("partial config is safe, exact IDs may contain colons/slashes, timeout boundaries validate", () => {
  assert.deepEqual(parseConfig({}), DEFAULT_CONFIG);
  assert.equal(parseConfig({ model: "provider/org/model:latest" }).model, "provider/org/model:latest");
  assert.equal(parseConfig({ timeoutMs: 1000 }).timeoutMs, 1000);
  assert.equal(parseConfig({ timeoutMs: 120000 }).timeoutMs, 120000);
});

test("malformed JSON and unreadable config surface sanitized errors and preserve original bytes", async () => {
  const root = await fixture("config-corrupt");
  try {
    const path = join(root, "session-title.json");
    const raw = '{ "autoGenerate": true, synthetic-private-value';
    await writeFile(path, raw);
    await assert.rejects(new FileConfigStore(path).read(), (error: Error) => !error.message.includes("synthetic-private"));
    assert.equal(await readFile(path, "utf8"), raw);
    await mkdir(join(root, "directory-config"));
    await assert.rejects(new FileConfigStore(join(root, "directory-config")).read());
  } finally { await cleanup(root); }
});

test("invalid writes do not replace a valid config or leave temporary files", async () => {
  const root = await fixture("config-invalid-write");
  try {
    const path = join(root, "session-title.json");
    const store = new FileConfigStore(path);
    await store.write({ ...DEFAULT_CONFIG });
    const bytes = await readFile(path, "utf8");
    await assert.rejects(store.write({ ...DEFAULT_CONFIG, timeoutMs: -1 }));
    assert.equal(await readFile(path, "utf8"), bytes);
    assert.deepEqual(await readdir(root), ["session-title.json"]);
  } finally { await cleanup(root); }
});
