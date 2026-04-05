import type { PlatformConfig } from "../platform.js";
export declare function findOpenPort(): Promise<number>;
export declare function getFrontmostApp(): string | null;
export declare function focusApp(appName: string | null): void;
export declare function runLogin(platform: PlatformConfig): Promise<void>;
