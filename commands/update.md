---
description: Update Bitfab plugin to the latest version
allowed-tools: ["Bash"]
---

# Bitfab Update

Run the update script to check for and apply the latest Bitfab plugin version:

```bash
node "${CURSOR_PLUGIN_ROOT}/dist/commands/update.js"
```

After the script completes, confirm the result to the user. If it updated successfully, remind them to restart Cursor to apply the update.
