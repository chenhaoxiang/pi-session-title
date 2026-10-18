import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanText, extractText, fallbackTitle, formatName, parseModelOutput, truncate } from "../src/text.js";
import { harness } from "./fixtures.js";

test("truncation and fallback preserve Unicode code points", () => {
  assert.equal(truncate("😀ab", 2), "😀a");
  assert.equal(fallbackTitle("\n\n😀".repeat(20)).title, "😀");
  assert.deepEqual(fallbackTitle(""), { title: "Untitled", tags: [] });
  assert.deepEqual(fallbackTitle("你好，世界\nsecond"), { title: "你好，世界", tags: [] });
  assert.equal([...fallbackTitle("😀".repeat(30)).title].length, 15);
});

test("text extraction includes only actual text blocks", () => {
  assert.equal(extractText("plain"), "plain");
  assert.equal(extractText(null), "");
  assert.equal(extractText([null, { type: "image", text: "private" }, { type: "text", text: "hello" }, { type: "text", text: 1 }]), "hello");
});

test("title output is normalized, bounded and tags are unique", () => {
  assert.deepEqual(parseModelOutput('标题：「会话标题」。\n标签：#测试，测试,extension,another tag'), {
    title: "会话标题", tags: ["测试", "extensio", "another", "tag"],
  });
  assert.equal(parseModelOutput("\n "), null);
  assert.equal(parseModelOutput("标题："), null);
  const result = parseModelOutput("😀".repeat(50) + "\na,b,c,d,e")!;
  assert.equal([...result.title].length, 20);
  assert.equal(result.tags.length, 4);
  assert.equal(formatName({ title: "Name", tags: ["one", "two"] }), "Name #one #two");
});

test("terminal escape sequences and controls never survive into a display name", () => {
  assert.equal(cleanText("\x1b[31mred\x1b[0m\x07\u202e text"), "red text");
  assert.equal(cleanText("before\x1b]0;injected\x07after"), "beforeafter");
});

test("footer truncates long manual names without changing persisted names", async () => {
  const h = harness();
  await h.emit("session_start");
  await h.command("title", "😀".repeat(50));
  assert.equal([...h.state.name!].length, 50);
  assert.equal([...h.statuses.get("session-title")!].length, 33);
  assert.equal(h.statuses.get("session-title")!.endsWith("…"), true);
});
