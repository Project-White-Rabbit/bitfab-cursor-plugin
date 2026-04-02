import { getConfig, hasCredentials } from "../config.js"
import { checkForUpdate, formatUpdateMessage } from "../updates.js"

async function main() {
  const config = getConfig()
  const { current, latest, updateAvailable } = await checkForUpdate()

  console.log(`Service URL: ${config.serviceUrl}`)
  const versionSuffix =
    updateAvailable && latest ? ` (${formatUpdateMessage(latest)})` : ""
  console.log(`Version: v${current}${versionSuffix}`)

  if (!hasCredentials()) {
    console.log("Status: not authenticated")
    console.log("\nRun /bitfab:login to authenticate.")
    return
  }

  console.log("Status: authenticated")
}

main().catch((err) => {
  console.error("Status check failed:", err.message)
  process.exit(1)
})
