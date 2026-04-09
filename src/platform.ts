import type { PlatformConfig } from "bitfab-plugin-lib"

export const platform: PlatformConfig = {
  authPath: "cursor",
  loginHint: "/bitfab-setup login",
  setupHint: "/bitfab-setup",
  updateHint: "/bitfab-update",
  repo: "Project-White-Rabbit/bitfab-cursor-plugin",
  cliBinary: "cursor",
  displayName: "Cursor",
  supportsAutoUpdate: false,
  marketplaceName: "bitfab",
  pluginName: "bitfab",
  marketplacePreRegistered: false,
}
