import type { BitfabConfig } from "./config.js";
import type { PlatformConfig } from "./platform.js";
export declare function startMcpServer(platform: PlatformConfig, getConfig: () => BitfabConfig): Promise<void>;
