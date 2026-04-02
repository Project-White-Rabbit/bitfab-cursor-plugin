---
description: Set up Bitfab tracing — authenticate, instrument, and create replay scripts
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Edit", "Write", "AskUserQuestion", "mcp__plugin_bitfab_Bitfab__setup_bitfab", "mcp__plugin_bitfab_Bitfab__get_bitfab_api_key"]
argument-hint: [all|login|instrument|replay]
---

# Bitfab Setup

**Always use `AskUserQuestion` when asking questions or presenting choices.** Never print a question as text and wait. Rules:
- Recommend an option first, explain why in one line
- Present 2-5 concrete options
- One decision per question — never batch

This skill has three phases: **login**, **instrument**, and **replay**. Run individually or all at once.

**MCP tools:** This skill uses `setup_bitfab` and `get_bitfab_api_key` from the **local plugin MCP server** (bundled with this plugin). Do NOT use the remote Bitfab MCP tools (`mcp__Simforge__*` or `mcp__Bitfab__*`) — use only the `mcp__plugin_bitfab_Bitfab__*` variants.

| Invocation | Action |
|---|---|
| `/bitfab:setup` or `/bitfab:setup all` | Run all three phases in order |
| `/bitfab:setup login` | Authenticate and retrieve API key |
| `/bitfab:setup instrument` | Instrument AI workflows with Bitfab tracing |
| `/bitfab:setup replay` | Create or update replay scripts for instrumented workflows |

---

## Login

Authenticate with Bitfab and retrieve the API key.

1. Run the status check:
   ```bash
   node "${CURSOR_PLUGIN_ROOT}/dist/commands/status.js"
   ```
   If **"not authenticated"**, run the login script yourself — do NOT ask the user to run it manually:
   ```bash
   node "${CURSOR_PLUGIN_ROOT}/dist/commands/login.js"
   ```
   This opens the browser for OAuth and waits for the callback (up to 2 minutes). Run with 150000ms timeout. After success, confirm and continue.
2. Call `mcp__plugin_bitfab_Bitfab__get_bitfab_api_key` to retrieve the API key — **NEVER print or log the full key**. Stored at `~/.config/bitfab/credentials.json`, used for the `BITFAB_API_KEY` environment variable.

**If running `login` only**, stop here and report the result.

---

## Instrument

Instrument the codebase with Bitfab tracing. Requires authentication (run Login first if needed).

Bitfab captures every AI function call — inputs, outputs, and errors — so you can see exactly what your AI is doing and discover what's going wrong. The goal is to have enough context in each trace to tell whether a call succeeded or failed, and why.

1. **Detect the project language** (TypeScript, Python, Ruby, or Go)
2. **Search for existing SDK usage** (`withSpan`, `@span`, `bitfab_span`, `client.Span`, `getFunction`, `get_function`, etc.)
   - If found: list the trace function keys, then use AskUserQuestion — "Search for more workflows" (find uninstrumented gaps) / "Continue" (skip to replay). If "Continue", skip to Replay.
   - If not found: proceed.
3. Use the API key from the Login phase (or retrieve it now if already authenticated)
4. Install the SDK (if not already installed) and set the `BITFAB_API_KEY` environment variable
5. Call `mcp__plugin_bitfab_Bitfab__setup_bitfab` with the detected language to get the SDK guide. Read it carefully.
6. Read the codebase to identify ALL AI workflows — every place the app makes LLM calls, runs agents, or makes AI-driven decisions
7. Present a numbered list of workflows found, ordered by value (most complex or LLM-heavy first). For each: function name, brief description, why tracing it is valuable. Recommend one to start with. Ask which to instrument: a number, multiple numbers, or "all".
8. **Read every function** that will appear in the trace plan (instrumented or skipped). Extract exact parameter names and return type fields from source code. See "Trace Plan Format" and "Trace Plan Accuracy" in the Reference section below.
9. Present the trace plan and **STOP** — use AskUserQuestion to confirm before writing code.
10. Instrument following the SDK guide exactly — purely additive. Never change behavior, arguments, return values, error handling, variable names, types, control flow, or code structure.
11. Tell the user how to run the app to generate the first trace — give exact command(s). Do NOT run it yourself.
12. After each workflow, use AskUserQuestion for next steps:
    > We recommend **A**: instrument [next workflow] — [one-line reason].
    >
    > A) **Instrument [next workflow]** — [why it's the next highest value]
    > B) **Instrument [other workflow]** — [alternative]
    > C) **Done** — stop here

    If A or B, return to step 8 for the selected workflow. If C, proceed.

**If running `instrument` only**, stop here after instrumentation is complete.

---

## Replay

Create or update replay scripts for instrumented trace functions. Requires instrumentation to be present in the codebase.

Replay scripts let the team regression-test any trace function against production data with one command — they fetch historical traces, re-run them through the current code, and report old vs. new outputs side-by-side. Each SDK has its own replay API (e.g., `bitfab.replay()` in TypeScript, `client.replay()` in Python, `client.replay` in Ruby, `client.Replay()` in Go).

For replay API details, call `mcp__plugin_bitfab_Bitfab__setup_bitfab` with the detected language to get the SDK guide.

1. **Gather all trace function keys** by searching for SDK patterns (`getFunction("key")`, `get_function("key")`, `bitfab_function "key"`, `WithFunctionName("key")`). This is the source of truth for what replay must cover.
2. **Search for existing replay scripts** — files matching `scripts/replay.*`, `scripts/*replay*`, or any file importing/calling the SDK's replay API.
3. **Compare coverage:**
   - If replay scripts exist but are missing trace function keys: use AskUserQuestion — "Add missing replay scripts for [Z]" / "Skip". If "Add missing", create them in step 4. If "Skip", stop.
   - If replay scripts exist and cover all keys: report up to date, stop.
   - If no replay scripts exist: use AskUserQuestion — "Create replay script" / "Skip". If "Skip", stop.
4. **Create the replay script** in the project's language (TypeScript, Python, Ruby, or Go). It should:
   - Accept a pipeline name as a CLI argument
   - Accept optional `--limit N` (default 10) and `--trace-ids id1,id2` flags
   - Map pipeline names to trace function keys and their replay functions
   - Use a per-pipeline replay function for each trace function (replay deserializes historical inputs — if the function signature doesn't match the raw input shape, the wrapper reshapes arguments)
   - Call the SDK's replay API and print results with delta summaries
   - Print a summary (total replayed, same, changed, errors) and the test run URL
   - Live in a `scripts/` directory (or the project's existing scripts location)

---

## Reference

These sections are consulted during the Instrument phase — not executed sequentially.

### Trace Plan Format

Present the plan as a compact tree diagram. Default view shows only instrumented (●) spans. Type goes inline in parentheses. Lines terminate at the last child. No descriptions, counts, or blank lines between siblings.

**Default view** (instrumented only):

```
Trace function: "<trace-function-key>"

[root]
● outerFunction (function)
├─ ● llmCall (llm)
└─ [loop]
   ├─ ● anotherLlmCall (llm)
   └─ ● refinementCall (llm)

Files changed:
  1. client.ts
  2. pipeline.ts
```

**Expanded view** adds skipped (○) in true execution order, plus the legend. No parameter details.

```
Trace function: "<trace-function-key>"
● instrumented   ○ skipped

[root]
● outerFunction (function)
├─ ○ helperFormat
├─ ● llmCall (llm)
└─ [loop]
   ├─ ○ evaluateBatch
   ├─ ○ calculateScore
   ├─ ● anotherLlmCall (llm)
   ├─ ● refinementCall (llm)
   └─ ○ evaluateBatch

Files changed:
  1. client.ts
  2. pipeline.ts
```

**Trace processor** (e.g., OpenAI Agents SDK) — auto-captured internals:

```
Trace function: "my-agent"

[root]
● runAgent (function)
   ├─ LLM calls    [auto]
   ├─ tool calls   [auto]
   └─ handoffs     [auto]
Setup: addTraceProcessor(processor) registered at startup
```

Use AskUserQuestion with previews: **"Proceed"** (recommended, default view), **"Expand details"** (expanded view), **"Adjust"**.

### Trace Plan Accuracy

Read every function in the trace plan (instrumented or skipped) using the `Read` tool. Extract exact parameter names and return types from source code — never guess.
