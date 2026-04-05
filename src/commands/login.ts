import { runLogin } from "bitfab-plugin-lib"
import { platform } from "../platform.js"

runLogin(platform).catch((err) => {
  console.error("Login failed:", err.message)
  process.exit(1)
})
