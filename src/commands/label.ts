import { runLabel } from "bitfab-plugin-lib"
import { platform } from "../platform.js"

runLabel(platform).catch((err) => {
  console.error("Failed to open labeling page:", err.message)
  process.exit(1)
})
