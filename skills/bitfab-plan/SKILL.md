---
name: bitfab-plan
description: "Open the most recent Bitfab trace plan in the browser"
---

# Bitfab Plan

Open the user's most recent trace plan in the browser. This is the fast path: no codebase scan, no LLM calls, no instrumentation work — just look up the latest plan for the current Bitfab organization and open it in the studio.

Use this when the user wants to revisit, share, or re-confirm a plan they already created with `/bitfab-setup`. If they have not created any trace plans yet, the page will show a small empty state pointing them at `/bitfab-setup`.

A fresh agent session is created so the resulting `tracePlan:latestOpened` event lands in the Studio live activity stream for whoever is watching the home page.

## 1. Open the latest trace plan

Run the plugin's view-last-plan helper. It opens `/trace-plans/latest` in the browser, which the bitfab-web server resolves to the most recent trace plan for the user's organization and redirects to it. If no plans exist, the page shows an empty state.

```bash
node "${CURSOR_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/dist/commands/viewLastTracePlan.js"
```

The command exits as soon as the browser tab is launched — it does not wait for the user to confirm or cancel. After the command exits, simply acknowledge: "Opened your most recent trace plan." Do not poll or run any other commands.
