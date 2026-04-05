import { hasCredentials } from "../config.js";
import { checkForUpdate } from "../updates.js";
export async function runSessionStart(currentVersion, platform) {
    const messages = [];
    try {
        if (!hasCredentials()) {
            messages.push(`[Bitfab] Not authenticated. Run ${platform.setupHint} to connect your account and instrument your codebase.`);
        }
    }
    catch { }
    if (platform.supportsAutoUpdate) {
        try {
            const { current, latest, updateAvailable, autoUpdateEnabled } = await checkForUpdate(currentVersion, platform);
            if (updateAvailable && latest) {
                const lines = [`[Bitfab] Update available: v${current} → v${latest}.`];
                if (autoUpdateEnabled) {
                    lines.push(`          Auto-update is enabled — restart to apply.`);
                }
                else {
                    lines.push(`          Run ${platform.updateHint} to update, or enable auto-update: /plugin → Marketplaces → bitfab → Enable auto-update`);
                }
                messages.push(lines.join("\n"));
            }
        }
        catch { }
    }
    if (messages.length > 0) {
        process.stdout.write(JSON.stringify({ systemMessage: `\n${messages.join("\n")}` }));
    }
}
