import { getConfig, startMcpServer } from "bitfab-plugin-lib";
import { platform } from "../platform.js";
startMcpServer(platform, getConfig).catch((err) => {
    console.error("Bitfab MCP server failed to start:", err);
    process.exit(1);
});
