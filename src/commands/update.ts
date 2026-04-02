import { execSync } from "node:child_process"
import { checkForUpdate } from "../updates.js"

async function main() {
  const { current, latest, updateAvailable } = await checkForUpdate()

  if (!updateAvailable || !latest) {
    console.log(`Bitfab plugin v${current} is already up to date.`)
    return
  }

  console.log(`Update available: v${current} → v${latest}`)
  console.log("Updating marketplace...")

  try {
    execSync("cursor plugin marketplace update bitfab", {
      stdio: "inherit",
    })
  } catch {
    console.error(
      "Failed to update marketplace. Is the 'bitfab' marketplace registered?",
    )
    console.error(
      "You can add it with: cursor plugin marketplace add Project-White-Rabbit/bitfab-cursor-plugin",
    )
    process.exit(1)
  }

  console.log("Updating plugin...")

  try {
    execSync("cursor plugin update bitfab@bitfab", {
      stdio: "inherit",
    })
  } catch {
    console.error("Failed to update plugin.")
    process.exit(1)
  }

  console.log(
    `\nBitfab plugin updated to v${latest}. Restart Cursor to apply the update.`,
  )
}

main().catch((err) => {
  console.error("Update failed:", err.message)
  process.exit(1)
})
