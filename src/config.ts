import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface TitleConfig {
  autoGenerate: boolean;
  model: string | null;
  timeoutMs: number;
}

export const DEFAULT_CONFIG: Readonly<TitleConfig> = Object.freeze({
  autoGenerate: false,
  model: null,
  timeoutMs: 15_000,
});

export interface ConfigStore {
  read(): Promise<TitleConfig>;
  write(config: TitleConfig): Promise<void>;
}

export function parseConfig(value: unknown): TitleConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid title configuration");
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !["autoGenerate", "model", "timeoutMs"].includes(key))) {
    throw new Error("Unknown title configuration key");
  }
  const config: TitleConfig = { ...DEFAULT_CONFIG };
  if (raw.autoGenerate !== undefined) {
    if (typeof raw.autoGenerate !== "boolean") throw new Error("autoGenerate must be boolean");
    config.autoGenerate = raw.autoGenerate;
  }
  if (raw.model !== undefined && raw.model !== null) {
    if (typeof raw.model !== "string" || !/^[^/\s]+\/\S+$/u.test(raw.model)) {
      throw new Error("model must be null or an exact provider/model ID");
    }
    config.model = raw.model;
  }
  if (raw.timeoutMs !== undefined) {
    if (!Number.isSafeInteger(raw.timeoutMs) || (raw.timeoutMs as number) < 1_000 || (raw.timeoutMs as number) > 120_000) {
      throw new Error("timeoutMs must be an integer from 1000 to 120000");
    }
    config.timeoutMs = raw.timeoutMs as number;
  }
  return config;
}

export class FileConfigStore implements ConfigStore {
  constructor(readonly path: string) {}

  async read(): Promise<TitleConfig> {
    let text: string;
    try { text = await readFile(this.path, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG };
      throw new Error("Could not read session-title.json");
    }
    try { return parseConfig(JSON.parse(text)); }
    catch { throw new Error("Invalid session-title.json; no model requests will be made"); }
  }

  async write(config: TitleConfig): Promise<void> {
    const validated = parseConfig(config);
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = this.path + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temporary, JSON.stringify(validated, null, 2) + "\n", { mode: 0o600, flag: "wx" });
      await rename(temporary, this.path);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
}
