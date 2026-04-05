import { runSessionStart } from "bitfab-plugin-lib"
import { platform } from "../platform.js"
import { getVersion } from "../version.js"

await runSessionStart(getVersion(), platform)
