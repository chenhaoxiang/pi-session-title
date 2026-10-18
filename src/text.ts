import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface TitleResult { title: string; tags: string[] }
export const MAX_INPUT_CHARS = 1500;

export function truncate(text: string, length: number): string {
  return [...text].slice(0, length).join("");
}

// Strip ANSI sequences, terminal controls and bidi overrides from displayed names.
export function cleanText(text: string): string {
  return text.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/gu, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/\s+/gu, " ").trim();
}

export function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((block: unknown) => {
    if (!block || typeof block !== "object") return [];
    const item = block as { type?: unknown; text?: unknown };
    return item.type === "text" && typeof item.text === "string" ? [item.text] : [];
  }).join("\n");
}

export function collectUserText(ctx: ExtensionContext, recent = false): string {
  const texts: string[] = [];
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message" || entry.message.role !== "user") continue;
    const text = extractText(entry.message.content).trim();
    if (text) texts.push(text);
  }
  // Automatic names describe the initial task; manual refreshes follow topic changes.
  const selected = recent ? texts.slice(-5) : texts.slice(0, 3);
  return truncate(selected.join("\n---\n"), MAX_INPUT_CHARS);
}

export function fallbackTitle(userText: string): TitleResult {
  const firstLine = userText.split(/\r?\n|---/u).find((line) => cleanText(line));
  return { title: truncate(cleanText(firstLine ?? "") || "Untitled", 15), tags: [] };
}

export function parseModelOutput(raw: string): TitleResult | null {
  const lines = raw.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (!lines[0]) return null;
  const title = truncate(cleanText(lines[0]).replace(/^(?:标题|title)\s*[:：]\s*/iu, "")
    .replace(/[。！？!?.,，、;；\s]+$/gu, "").replace(/^[「『"'\x60]+|[」』"'\x60]+$/gu, ""), 20);
  if (!title) return null;
  const tagLine = (lines[1] ?? "").replace(/^(?:标签|tags?|关键词)\s*[:：]\s*/iu, "");
  const tags = [...new Set(tagLine.split(/[,，、\s#]+/u)
    .map((tag) => truncate(cleanText(tag).replace(/^#+/u, ""), 8)).filter(Boolean))].slice(0, 4);
  return { title, tags };
}

export function formatName(result: TitleResult): string {
  return [result.title, ...result.tags.map((tag) => "#" + tag)].join(" ");
}
