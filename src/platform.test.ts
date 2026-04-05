import { describe, expect, it } from "vitest"
import { platform } from "./platform.js"

describe("platform", () => {
  it("uses Cursor-specific auth and hints", () => {
    expect(platform.authPath).toBe("cursor")
    expect(platform.displayName).toBe("Cursor")
    expect(platform.cliBinary).toBe("cursor")
    expect(platform.supportsAutoUpdate).toBe(false)
  })
})
