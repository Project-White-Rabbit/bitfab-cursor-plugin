import { runStatus } from "bitfab-plugin-lib";
import { platform } from "../platform.js";
import { getVersion } from "../version.js";
runStatus(getVersion(), platform).catch((err) => {
    console.error("Status check failed:", err.message);
    process.exit(1);
});
