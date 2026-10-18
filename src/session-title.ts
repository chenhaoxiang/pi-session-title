import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FileConfigStore } from "./config.js";
import { registerSessionTitle } from "./controller.js";

export default function sessionTitle(pi: ExtensionAPI): void {
  registerSessionTitle(pi, new FileConfigStore(join(getAgentDir(), "session-title.json")));
}
