---
name: bitfab-setup
description: "Set up Bitfab tracing. Usage: /bitfab-setup [all|login|login headless|instrument|replay]"
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
| `/bitfab-setup` or `/bitfab-setup all` | Run all three phases in order |
| `/bitfab-setup login` | Authenticate via browser OAuth and retrieve API key |
| `/bitfab-setup login headless` | Authenticate by pasting a token (no browser callback needed) |
| `/bitfab-setup instrument` | Instrument AI workflows with Bitfab tracing |
| `/bitfab-setup replay` | Create or update replay scripts for instrumented workflows |

---

## Login

Authenticate with Bitfab and retrieve the API key.

1. Run the status check:
   ```bash
   node "${CURSOR_PLUGIN_ROOT}/dist/commands/status.js"
   ```
   If **already authenticated**, skip to step 3.
2. If **"not authenticated"**, run the login script yourself — do NOT ask the user to run it manually:
   ```bash
   node "${CURSOR_PLUGIN_ROOT}/dist/commands/login.js"
   ```
   This opens the browser for OAuth and waits for the loopback callback. Run with 600000ms timeout (10 minutes). If the command **exits with an error**, **fails to reach the browser**, or **times out** — fall through to the **Login (headless)** flow below. This commonly happens on SSH sessions, sandboxed environments, cloud IDEs, and Codespaces where the browser can't reach the CLI's loopback port.
3. Call `mcp__plugin_bitfab_Bitfab__get_bitfab_api_key` to retrieve the API key — **NEVER print or log the full key**. Stored at `~/.config/bitfab/credentials.json`, used for the `BITFAB_API_KEY` environment variable.

**If running `login` only**, stop here and report the result.

---

## Login (headless)

Use this flow when the browser callback can't reach the terminal — SSH sessions, sandboxed environments, cloud IDEs, Codespaces, CI runners. Triggered explicitly by `/bitfab-setup login headless`, or as an automatic fallback when the normal Login flow above fails.

1. Determine the service URL. Default is `https://bitfab.ai`. If the user has a custom deployment, read it from `~/.config/bitfab/config.json` (field `serviceUrl`) or the `BITFAB_SERVICE_URL` environment variable.
2. Tell the user:
   > Open this URL in a browser on any device: **{serviceUrl}/plugin/auth/cursor**
   >
   > Sign in with your Bitfab account. The page will show an API key with a copy button. Paste the token here when you have it.
3. Wait for the user's next message — it will contain the token. Do NOT use `AskUserQuestion` here (it adds an unnecessary extra step before the user can paste).
4. When the user pastes the token, validate it with curl — do NOT echo the token back to the user or print it in any output:
   ```bash
   curl -fsS -H "Authorization: Bearer <TOKEN>" "{serviceUrl}/api/plugin/whoami"
   ```
   If this returns 200 with a JSON body containing `user.email`, the token is valid. If it fails, tell the user the token was invalid and ask them to re-paste (do not re-print the bad token).
5. Save the token to `~/.config/bitfab/credentials.json` using the `Write` tool with this exact content (replace `<TOKEN>` with the pasted value, nothing else):
   ```json
   {
     "apiKey": "<TOKEN>"
   }
   ```
   Create the `~/.config/bitfab/` directory first if it doesn't exist:
   ```bash
   mkdir -p ~/.config/bitfab
   ```
6. Confirm success to the user by referencing the email returned from `/api/plugin/whoami` — e.g. "Signed in as alice@example.com." **Never echo the token back.**
7. Continue with the rest of setup, or stop if running `login headless` only.

---

## Instrument

Instrument the codebase with Bitfab tracing. Requires authentication (run Login first if needed).

Bitfab captures every AI function call — inputs, outputs, and errors — so you can see exactly what your AI is doing and discover what's going wrong. The goal is to have enough context in each trace to tell whether a call succeeded or failed, and why.

1. **Detect the project language** (TypeScript, Python, Ruby, or Go). In a monorepo, identify which directories are **applications** (services, APIs, agents) vs **libraries** (SDKs, shared packages). Focus on application directories.
2. **Search for existing SDK usage** (`withSpan`, `@span`, `bitfab_span`, `client.Span`, `getFunction`, `get_function`, etc.). In a monorepo, search **each application directory separately** — a root-level search can miss subdirectories.
   - If found: list the trace function keys, then use AskUserQuestion — "Search for more workflows" (find uninstrumented gaps) / "Continue" (skip to replay). If "Continue", skip to Replay.
   - If not found: **proceed to step 3** — no SDK usage does NOT mean nothing to instrument, it means the SDK hasn't been installed yet. NEVER conclude "nothing to instrument" before completing step 6.
3. Use the API key from the Login phase (or retrieve it now if already authenticated)
4. Install the SDK (if not already installed) and set the `BITFAB_API_KEY` environment variable
5. Call `mcp__plugin_bitfab_Bitfab__setup_bitfab` with the detected language to get the SDK guide. Read it carefully.
6. When deciding what the root of a trace function should be, you should target a common ancestor for an entire agents activity across many prompts, tools, and context.
7. Read the codebase to identify ALL AI workflows — every place the app makes LLM calls, runs agents, or makes AI-driven decisions
8. Present a numbered list of workflows found, ordered by value (most complex or LLM-heavy first). For each: function name, brief description, why tracing it is valuable. Recommend one to start with. **Ask the user to pick exactly ONE workflow to instrument first.** Never accept "multiple" or "all" — each Instrument cycle produces exactly one trace function with one trace plan and one set of code changes. If the user wants to instrument several, they will be done sequentially via the loop in step 13, one at a time.
9. **Read function signatures you'll reference in the trace plan** — root function first, then any whose parameter names or return fields aren't already obvious from the step 7 scan. Skipped leaf functions only need their names; don't Read them unless their shape appears in the plan. Never guess names. See "Trace Plan Format" and "Trace Plan Accuracy" in the Reference section below.
10. **Build the trace plan under a hard constraint: the resulting instrumentation must be purely additive.** If a candidate tree requires *any* behavior change to make spans nest correctly (awaiting a stream that wasn't awaited, delaying a call, reordering operations, blocking a callback, restructuring control flow), the tree is invalid — restructure the *tree* instead (make spans siblings, split into separate trace functions across separate cycles, or accept a flatter shape). Never present a behavior-changing approach as an option, not even as a non-recommended alternative. Then present the trace plan **using the format defined in the "Trace Plan Format" reference section below** (legend → grammar → template precedence → canonical example). **STOP** — use AskUserQuestion to confirm before writing code.
11. Instrument following the SDK guide exactly — purely additive. Never change behavior, arguments, return values, error handling, variable names, types, control flow, or code structure. Batch repetitive edits in parallel (one message, many edit calls); for large mechanical fan-outs (>10 files of the same wrapper pattern), validate the pattern on one file, then delegate the rest to a subagent.
12. Tell the user how to run the app to generate the first trace — give exact command(s). Do NOT run it yourself.
13. **MANDATORY STOP — never jump straight to Replay or silently end the cycle.** Check whether traces already exist for the current trace function key via `mcp__plugin_bitfab_Bitfab__search_traces` (or `list_trace_functions`) — the **only** place the skill calls these tools. An empty result is expected (the user hasn't run the app yet) and means "offer option A," not "skip step 13." Then use AskUserQuestion:
    > We recommend **A**: generate traces before instrumenting the next workflows - [one-line reason].
    >
    > A) **Generate traces [current workflow]** — [present the script to run to the user. Allow them to let you to run it for them.] *(omit if traces already exist)*
    > B) **Instrument [next workflow]** — [why it's the next highest value]
    > C) **Instrument [other workflow]** — [alternative]
    > D) **Done** — stop here

    A, B, and C all return to step 8 for the selected workflow. Only D exits the Instrument loop. After D, if invoked in `all` mode, proceed to Replay; otherwise stop.

---

## Replay

Create or update replay scripts for instrumented trace functions. Requires instrumentation in the codebase; does **not** require existing traces — replay scripts are created from trace function keys in the code, not captured trace data.

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
   - **Each pipeline's replay function MUST import and call the actual instrumented function** — never a stub or identity function. If the function signature doesn't match the raw input shape, reshape arguments in the wrapper.
   - **If the instrumented function is factory-created** (takes session, stream writers, config via closure), call the factory in the wrapper with mocks:
     - Stream/socket writers: no-op (`{ write: () => {}, merge: () => {} }`)
     - Auth/session objects: minimal mock with the fields the function reads
     - Model IDs / config: sensible default or env var
     - DB-dependent functions: note in usage comment that a running DB is required
   - Call the SDK's replay API and print results with delta summaries
   - Print a summary (total replayed, same, changed, errors) and the test run URL
   - Live in a `scripts/` directory (or the project's existing scripts location)

---

## Reference

These sections are consulted during the Instrument phase — not executed sequentially.

### Trace Plan Format

The trace plan is a strict format. Do not improvise — follow the legend, grammar, and template selection rule below. When in doubt, copy the matching canonical example verbatim and substitute names.

#### Legend

| Symbol | Meaning | Where it appears |
|---|---|---|
| `●` | Instrumented span | Default + Expanded + Processor views |
| `○` | Skipped function (not instrumented) | Expanded view only |
| `[root]` | Literal label for the trace function entry point | Always, on its own line above the tree |
| `[loop]` | Control-flow group: children execute in a loop | Inside the tree, in place of a span |
| `[branch]` | Control-flow group: children are conditional branches | Inside the tree, in place of a span |
| `[parallel]` | Control-flow group: children execute concurrently | Inside the tree, in place of a span |
| `[auto]` | Auto-captured by a trace processor — no manual instrumentation | Trace-processor view only |
| `(function)` `(llm)` `(tool)` `(agent)` `(handoff)` | Span type annotation | Immediately after every `●` span name |

Brackets `[…]` are structural labels (not spans). Parens `(…)` are span type annotations (only on `●` lines).

#### Grammar rules

1. **Header line** — exactly: `Trace function: "<trace-function-key>"` followed by one blank line.
2. **Root** — the next line is the literal `[root]`, with no symbol prefix.
3. **Tree body** — uses box-drawing characters only:
   - `├─` for every child except the last
   - `└─` for the last child
   - Children of a `├─` node indent with `│  ` (pipe + two spaces)
   - Children of a `└─` node indent with `   ` (three spaces, no pipe)
4. **Span lines** — `<prefix>● <name> (<type>)`. Type annotation is **required** on every `●` line.
5. **Skipped lines** — `<prefix>○ <name>`. No type annotation, no description.
6. **Control-flow lines** — `<prefix>[loop]` / `[branch]` / `[parallel]`. They take children but have no symbol and no type.
7. **Footer** — one blank line, then either:
   - `Files changed:` followed by a numbered list (manual instrumentation), OR
   - `Setup: <one-line setup description>` (trace processor only)
8. **No descriptions, no counts, no parameter details, no blank lines between siblings, no trailing whitespace.**
9. **One trace function per plan.** A trace plan describes exactly one trace function — exactly one `Trace function: "..."` header, exactly one `[root]`, exactly one tree, exactly one `Files changed:` section. If the cycle would require instrumenting two trace functions, that's two cycles, not one plan with two trees.

#### Which template to use (precedence — check top to bottom, stop at first match)

1. **Trace processor template** — if the SDK guide says to register a processor (e.g. OpenAI Agents SDK `addTraceProcessor`). Children of the root span are auto-captured and shown as `[auto]` lines.
2. **Expanded view** — only if the user explicitly asks ("show details", "expand", "include skipped"), or selects "Expand details" from the AskUserQuestion preview.
3. **Default view** — every other case. This is the recommended default.

Never mix templates. Never invent a fourth variant.

#### Canonical examples (copy-edit-substitute, do not restructure)

**Default view** — instrumented spans only:

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

**Expanded view** — adds skipped (○) functions in true execution order:

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

The legend line `● instrumented   ○ skipped` appears **only** in the expanded view, immediately under the header.

**Trace-processor view** — auto-captured internals:

```
Trace function: "my-agent"

[root]
● runAgent (function)
├─ LLM calls    [auto]
├─ tool calls   [auto]
└─ handoffs     [auto]

Setup: addTraceProcessor(processor) registered at startup
```

The `[auto]` lines are not spans — they describe what the processor will capture. They use `├─`/`└─` like normal children but carry no `●`/`○` symbol.

#### Anti-examples (do NOT do these)

- ❌ `* outerFunction (function)` — use `●`, never `*` or `-` or `•`
- ❌ `● outerFunction` — type annotation is mandatory on every instrumented span
- ❌ `● outerFunction (function) — calls the LLM with retries` — no descriptions, no em dashes
- ❌ `● outerFunction (llm-call)` — only the listed types are valid; do not invent new ones
- ❌ `[Root]` or `[ROOT]` — literal label is lowercase `[root]`
- ❌ Mixed indentation widths (2 spaces in one branch, 4 in another)
- ❌ Blank lines between siblings inside the tree
- ❌ Adding `Files changed:` to the trace-processor view, or omitting it from default/expanded
- ❌ Inventing extra sections like `Notes:` or `Estimated coverage:`
- ❌ Two `Trace function: "..."` headers in one plan — split into two cycles
- ❌ `● someFn (llm)   ← description here` — no inline descriptions, arrows, or trailing commentary on span lines
- ❌ `● <kind>DocumentCreate (llm)` — no placeholder/template span names; expand to concrete spans (e.g., three siblings, or under a `[branch]`)
- ❌ `Files changed` without the trailing colon
- ❌ `1. lib/bitfab.ts (new) — Bitfab client + exported pipelines` — file entries are paths only, no annotations or descriptions
- ❌ Recommending an approach that requires "a tiny behavior change" — disqualified at trace plan construction; restructure the tree instead

#### Presentation step

After building the plan according to the rules above, use AskUserQuestion with these three options:
- **Proceed** (recommended) — accept the default view as shown
- **Expand details** — re-render using the expanded view template
- **Adjust** — user wants changes; ask what

### Trace Plan Accuracy

Read function signatures with the `Read` tool when the trace plan will reference their parameter names or return fields. Skipped leaf functions can be named from grep results if their shape isn't exposed in the plan. Never guess names that appear in the plan.
