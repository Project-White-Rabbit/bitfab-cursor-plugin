import { getConfig, hasCredentials } from "../config.js";
import { checkForUpdate, formatUpdateMessage } from "../updates.js";
export async function runStatus(currentVersion, platform) {
    const config = getConfig();
    const { current, latest, updateAvailable } = await checkForUpdate(currentVersion, platform);
    console.log(`Service URL: ${config.serviceUrl}`);
    const versionSuffix = updateAvailable && latest
        ? ` (${formatUpdateMessage(latest, platform)})`
        : "";
    console.log(`Version: v${current}${versionSuffix}`);
    if (!hasCredentials()) {
        console.log("Status: not authenticated");
        console.log(`\nRun ${platform.loginHint} to authenticate.`);
        return;
    }
    console.log("Status: authenticated");
}
