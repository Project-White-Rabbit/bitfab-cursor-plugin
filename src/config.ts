import fs from "node:fs"
import os from "node:os"
import path from "node:path"

interface BitfabConfig {
  serviceUrl: string
  apiKey: string | null
  verbose: boolean
  debug: boolean
}

const DEFAULT_SERVICE_URL = "https://bitfab.ai"
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".config", "bitfab")
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, "config.json")
const GLOBAL_CREDENTIALS_FILE = path.join(GLOBAL_CONFIG_DIR, "credentials.json")

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8")
    return JSON.parse(content)
  } catch {
    return null
  }
}

function getConfigData(): Record<string, unknown> {
  return readJsonFile(GLOBAL_CONFIG_FILE) ?? {}
}

function getCredentialsData(): Record<string, unknown> {
  return readJsonFile(GLOBAL_CREDENTIALS_FILE) ?? {}
}

function getServiceUrl(): string {
  if (process.env.BITFAB_SERVICE_URL) {
    return process.env.BITFAB_SERVICE_URL
  }
  const config = getConfigData()
  return typeof config.serviceUrl === "string"
    ? config.serviceUrl
    : DEFAULT_SERVICE_URL
}

function getApiKey(): string | null {
  if (process.env.BITFAB_API_KEY) {
    return process.env.BITFAB_API_KEY
  }
  const creds = getCredentialsData()
  return typeof creds.apiKey === "string" ? creds.apiKey : null
}

function getVerbose(): boolean {
  if (
    process.env.BITFAB_VERBOSE === "true" ||
    process.env.BITFAB_VERBOSE === "1"
  ) {
    return true
  }
  if (
    process.env.BITFAB_VERBOSE === "false" ||
    process.env.BITFAB_VERBOSE === "0"
  ) {
    return false
  }
  const config = getConfigData()
  return config.verbose === true
}

function getDebug(): boolean {
  if (process.env.BITFAB_DEBUG === "true" || process.env.BITFAB_DEBUG === "1") {
    return true
  }
  const config = getConfigData()
  return config.debug === true
}

export function getConfig(): BitfabConfig {
  return {
    serviceUrl: getServiceUrl(),
    apiKey: getApiKey(),
    verbose: getVerbose(),
    debug: getDebug(),
  }
}

export function saveCredentials(apiKey: string): void {
  fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true })
  fs.writeFileSync(
    GLOBAL_CREDENTIALS_FILE,
    `${JSON.stringify({ apiKey }, null, 2)}\n`,
  )
}

export function deleteCredentials(): void {
  try {
    fs.unlinkSync(GLOBAL_CREDENTIALS_FILE)
  } catch {
    // already gone
  }
}

export function hasCredentials(): boolean {
  return getApiKey() !== null
}

export { GLOBAL_CREDENTIALS_FILE as CREDENTIALS_FILE }
