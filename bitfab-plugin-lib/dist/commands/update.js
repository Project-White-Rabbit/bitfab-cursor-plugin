import { execSync } from "node:child_process";
import { checkForUpdate } from "../updates.js";
export async function runUpdate(currentVersion, platform) {
    const { current, latest, updateAvailable } = await checkForUpdate(currentVersion, platform);
    if (!updateAvailable || !latest) {
        console.log(`Bitfab plugin v${current} is already up to date.`);
        return;
    }
    console.log(`Update available: v${current} → v${latest}`);
    console.log("Updating marketplace...");
    try {
        execSync(`${platform.cliBinary} plugin marketplace update bitfab`, {
            stdio: "inherit",
        });
    }
    catch {
        console.error("Failed to update marketplace. Is the 'bitfab' marketplace registered?");
        console.error(`You can add it with: ${platform.cliBinary} plugin marketplace add ${platform.repo}`);
        process.exit(1);
    }
    console.log("Updating plugin...");
    try {
        execSync(`${platform.cliBinary} plugin update bitfab@bitfab`, {
            stdio: "inherit",
        });
    }
    catch {
        console.error("Failed to update plugin.");
        process.exit(1);
    }
    console.log(`\nBitfab plugin updated to v${latest}. Restart ${platform.displayName} to apply the update.`);
}
