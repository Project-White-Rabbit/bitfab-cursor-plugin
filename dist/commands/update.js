import { runUpdate } from "bitfab-plugin-lib";
import { platform } from "../platform.js";
import { getVersion } from "../version.js";
runUpdate(getVersion(), platform).catch((err) => {
    console.error("Update failed:", err.message);
    process.exit(1);
});
