import fs from "node:fs";
import os from "node:os";
import path from "node:path";
async function getLatestVersion(repo) {
    try {
        const response = await fetch(`https://raw.githubusercontent.com/${repo}/main/package.json`, { signal: AbortSignal.timeout(3000) });
        if (!response.ok) {
            return null;
        }
        const pkg = (await response.json());
        return pkg.version;
    }
    catch {
        return null;
    }
}
function isNewer(latest, current) {
    const [lMajor, lMinor, lPatch] = latest.split(".").map(Number);
    const [cMajor, cMinor, cPatch] = current.split(".").map(Number);
    if (lMajor !== cMajor) {
        return lMajor > cMajor;
    }
    if (lMinor !== cMinor) {
        return lMinor > cMinor;
    }
    return lPatch > cPatch;
}
function isAutoUpdateEnabled(repo) {
    try {
        const marketplacesPath = path.join(os.homedir(), ".claude", "plugins", "known_marketplaces.json");
        const content = fs.readFileSync(marketplacesPath, "utf-8");
        const data = JSON.parse(content);
        for (const marketplace of Object.values(data)) {
            if (marketplace.source?.repo === repo) {
                return marketplace.autoUpdate === true;
            }
        }
    }
    catch {
        // File doesn't exist or can't be parsed
    }
    return false;
}
export async function checkForUpdate(currentVersion, platform) {
    const latest = await getLatestVersion(platform.repo);
    return {
        current: currentVersion,
        latest,
        updateAvailable: latest !== null && isNewer(latest, currentVersion),
        autoUpdateEnabled: platform.supportsAutoUpdate
            ? isAutoUpdateEnabled(platform.repo)
            : false,
    };
}
export function formatUpdateMessage(latest, platform) {
    return `v${latest} available — run ${platform.updateHint} to update`;
}
