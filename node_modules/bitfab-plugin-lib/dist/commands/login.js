import { exec, execSync } from "node:child_process";
import http from "node:http";
import os from "node:os";
import { getConfig, saveCredentials } from "../config.js";
function openBrowser(url) {
    const platform = os.platform();
    const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
    exec(`${cmd} "${url}"`);
}
export function findOpenPort() {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        server.listen(0, () => {
            const addr = server.address();
            if (addr && typeof addr === "object") {
                const port = addr.port;
                server.close(() => resolve(port));
            }
            else {
                reject(new Error("Could not find open port"));
            }
        });
    });
}
export function getFrontmostApp() {
    if (os.platform() !== "darwin") {
        return null;
    }
    try {
        return execSync(`osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`, { stdio: "pipe", encoding: "utf-8" }).trim();
    }
    catch {
        return null;
    }
}
export function focusApp(appName) {
    if (!appName || os.platform() !== "darwin") {
        return;
    }
    exec(`osascript -e 'tell application "${appName}" to activate'`);
}
const CALLBACK_HTML = `<html>
<body style="margin:0;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden">
  <div style="text-align:center;max-width:400px">
    <h1 style="font-size:24px;font-weight:600;margin:0 0 16px 0">Bitfab</h1>
    <p style="margin:0;color:#059669">Authenticated! You can close this window.</p>
    <button onclick="window.close()" style="margin-top:16px;padding:8px 16px;background:#0f172a;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer">Close Window</button>
  </div>
</body>
<script>window.close()</script>
</html>`;
export async function runLogin(platform) {
    const config = getConfig();
    const previousApp = getFrontmostApp();
    const port = await findOpenPort();
    console.log("Starting authentication flow...");
    console.log(`Callback server listening on port ${port}`);
    const server = http.createServer((req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        const url = new URL(req.url ?? "/", `http://localhost:${port}`);
        if (url.pathname === "/callback") {
            const token = url.searchParams.get("token");
            if (token) {
                saveCredentials(token);
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(CALLBACK_HTML);
                console.log("Authentication successful! Bitfab MCP tools are now active.");
                focusApp(previousApp);
                server.close();
                process.exit(0);
            }
            else {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "No token received" }));
                console.error("Error: No token in callback");
                setTimeout(() => {
                    server.close();
                    process.exit(1);
                }, 500);
            }
        }
        else {
            res.writeHead(404);
            res.end();
        }
    });
    server.listen(port, () => {
        const authUrl = `${config.serviceUrl}/auth/${platform.authPath}?port=${port}`;
        console.log(`Opening browser: ${authUrl}`);
        openBrowser(authUrl);
    });
    setTimeout(() => {
        console.error("Authentication timed out after 2 minutes.");
        server.close();
        process.exit(1);
    }, 120_000);
}
