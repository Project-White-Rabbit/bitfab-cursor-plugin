import type { PlatformConfig } from "./platform.js";
interface UpdateStatus {
    current: string;
    latest: string | null;
    updateAvailable: boolean;
    autoUpdateEnabled: boolean;
}
export declare function checkForUpdate(currentVersion: string, platform: PlatformConfig): Promise<UpdateStatus>;
export declare function formatUpdateMessage(latest: string, platform: PlatformConfig): string;
export {};
