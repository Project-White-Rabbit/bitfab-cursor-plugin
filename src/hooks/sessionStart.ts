import { hasCredentials } from "../config.js"
import { checkForUpdate } from "../updates.js"

const messages: string[] = []

try {
  if (!hasCredentials()) {
    messages.push(
      `[Bitfab] Not authenticated. Run /bitfab:setup to connect your account and instrument your codebase.`,
    )
  }
} catch {}

try {
  const { current, latest, updateAvailable } = await checkForUpdate()
  if (updateAvailable && latest) {
    messages.push(
      `[Bitfab] Update available: v${current} → v${latest}. Run /bitfab:update to update.`,
    )
  }
} catch {}

if (messages.length > 0) {
  process.stdout.write(
    JSON.stringify({ systemMessage: `\n${messages.join("\n")}` }),
  )
}
