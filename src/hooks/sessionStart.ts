import { hasCredentials } from "../config.js"

const messages: string[] = []

try {
  if (!hasCredentials()) {
    messages.push(
      `[Bitfab] Not authenticated. Run /bitfab-setup to connect your account and instrument your codebase.`,
    )
  }
} catch {}

if (messages.length > 0) {
  process.stdout.write(
    JSON.stringify({ systemMessage: `\n${messages.join("\n")}` }),
  )
}
