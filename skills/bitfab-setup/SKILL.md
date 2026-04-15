---
name: bitfab-setup
description: "Set up Bitfab tracing. Usage: /bitfab-setup [all|login|login headless|instrument|modify|replay]"
---

# Bitfab Setup

**Always use `AskUserQuestion` when asking questions or presenting choices.** Never print a question as text and wait. Rules:
- Recommend an option first, explain why in one line
- Present 2-5 concrete options
- One decision per question — never batch

This skill has four phases: **login**, **instrument**, **modify**, and **replay**. Run individually or all at once (`all` runs login → instrument → replay; `modify` is only invoked explicitly or as a branch from the Instrument step 2 menu).

**SDK reference:** https://docs.bitfab.ai is the source of truth for SDK install, initialization, API surface, and replay. Fetch the language-specific page (`/typescript-sdk`, `/python-sdk`, `/ruby-sdk`, `/go-sdk`) before writing instrumentation or replay code — do not improvise from memory.

**MCP tools:** This skill uses `get_bitfab_api_key` from the **local plugin MCP server** (bundled with this plugin). Do NOT use the remote Bitfab MCP tools (`mcp__Simforge__*` or `mcp__Bitfab__*`) — use only the `mcp__plugin_bitfab_Bitfab__*` variants.

| Invocation | Action |
|---|---|
| `/bitfab-setup` or `/bitfab-setup all` | Run login → instrument → replay in order |
| `/bitfab-setup login` | Authenticate via browser OAuth and retrieve API key |
| `/bitfab-setup login headless` | Authenticate by pasting a token (no browser callback needed) |
| `/bitfab-setup instrument` | Instrument AI workflows with Bitfab tracing |
| `/bitfab-setup modify` | Modify an existing trace setup (add context, change depth, or move the root) |
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
   - If found: list the trace function keys, then use AskUserQuestion — "Search for more workflows" (find uninstrumented gaps) / "Modify an existing trace setup" (jump to the Modify phase) / "Continue" (skip to replay). If "Modify", jump to the Modify phase. If "Continue", skip to Replay.
   - If not found: **proceed to step 3** — no SDK usage does NOT mean nothing to instrument, it means the SDK hasn't been installed yet. NEVER conclude "nothing to instrument" before completing step 6.
3. Use the API key from the Login phase (or retrieve it now if already authenticated)
4. **Install the SDK now.** Detect the project's package manager from its manifest (pyproject.toml → `uv`/`poetry`; package.json → `pnpm`/`npm`/`yarn`/`bun`; Gemfile → `bundle`; go.mod → `go get`; requirements.txt → edit file + `pip install -r`) and run its canonical add command — do NOT stop to ask about version pinning or dep groups. Prefer `uv add`/`poetry add` over bare `pip install` (bare `pip install` doesn't persist to pyproject.toml). In monorepos, scope to the correct workspace (e.g. `pnpm add --filter <pkg>`, or cd into the app directory first) — running from the repo root will install into the wrong package. Default to a runtime dep for applications; a dev dep for libraries/SDKs where a runtime dep would propagate to downstream users.

    **Then persist `BITFAB_API_KEY` to the project's env file — do NOT skip this step or settle for an in-shell `export`.** The replay script and the app itself read from `.env`, and without the key written there, the next phase (and the user's next run) will silently fail to send traces. Procedure:
    1. Locate the app's env file. Check, in order: `.env.local`, `.env.development`, `.env` in the app directory (the same directory as the manifest you detected in this step — not the repo root in a monorepo unless that's where env vars live). If none exist, create `.env` in the app directory.
    2. If the file already contains a `BITFAB_API_KEY=` line, leave it alone (do not overwrite — the user may have a different key for another environment). Otherwise, **append** `BITFAB_API_KEY=<key>` using the key from step 3 of the Login phase. Never print or log the key value — only write it to the file.
    3. If the env file isn't covered by `.gitignore`, add it.
    4. Confirm to the user with the file path only: "Wrote BITFAB_API_KEY to `<path>`".
5. **Read the SDK reference** at https://docs.bitfab.ai/<language>-sdk (TypeScript: `/typescript-sdk`, Python: `/python-sdk`, Ruby: `/ruby-sdk`, Go: `/go-sdk`). Fetch with WebFetch or ask the user to share the page. This is the source of truth for install commands, initialization, the `withSpan` / `@span` / `bitfab_span` / `client.Span` API surface, span types, and replay. **Do not improvise instrumentation from memory** — the API has moved and guessing will produce broken code. If you need anything else about the SDK, https://docs.bitfab.ai is where to find it.
6. When deciding what the root of a trace function should be, you should target a common ancestor for an entire agent's activity across many prompts, tools, and context. The root is the **outer workflow function** that owns the AI behavior end-to-end (API handler, message processor, job runner, pipeline coordinator) — almost never the LLM call or the agent SDK's `run()` itself. If the workflow wraps an SDK agent call (e.g. OpenAI Agents SDK), the root is the caller that prepares input → invokes the agent → processes the output → returns to the caller, NOT the agent call.

    **Hard constraint: the root's inputs must be serializable by the SDK's tracing layer so traces can be replayed.** Every span input and output gets serialized into the trace using the SDK's language-native serialization (TypeScript/JSON, Python/JSON via Pydantic, Ruby/`to_json`, Go/`json.Marshal`). If the outer workflow function takes live runtime objects that don't round-trip through that serialization — browser objects (`MediaStream`, `RTCPeerConnection`, `WebSocket`, DOM refs), HTTP `Request`/`Response`, stream writers, open sockets, or framework request contexts whose content is genuinely opaque (not reconstructible from headers + user id) — the trace can't be replayed. Module-level dependencies (DB clients, env vars, config loaders) do **not** count — replay inherits them from the app's loaded environment. When the natural outer boundary has unserializable inputs, do **one** of the following **before writing code**:
    - **Move the trace boundary inward** to the first function whose inputs are serializable (e.g. trace `processTurn(transcript, context)` instead of `handleSession(stream, peerConnection)`). This is not a refactor.
    - **Refactor** so a function with serializable inputs exists. Two flavors, chosen per case in the refactor plan:
      - **Visibility refactor (common)** — the logic that takes serializable inputs already exists inline but isn't importable (embedded in a route handler, not exported). Extract it into a named, exported function at module scope. No semantic change.
      - **Structural refactor (rare overall, common for realtime/streaming/browser apps)** — no function with serializable inputs exists yet. Introduce one: a pure core whose parameters are serializable, with callers constructing them. A real rewrite.

    Raise this with the user in step 8 (not later) — never instrument a root with unserializable inputs and try to fix it in the Replay phase.
7. Read the codebase to identify ALL AI workflows — every place the app makes LLM calls, runs agents, or makes AI-driven decisions. For each, find the **outer workflow boundary** (per the rule in step 6), and also note any meaningful work **above** the agent/LLM call (auth, validation, input prep, retry/orchestration loops, multi-agent coordination), **alongside** it (custom LLM calls outside the SDK, tools that aren't registered with the SDK, downstream services), and **below** it (post-processing, parsing, persistence). These are the manual spans that will sit around any auto-captured SDK content.
8. Present a numbered list of workflows found, ordered by value (most complex or LLM-heavy first). For each, give:
   - **Trace boundary** — the outer workflow function that will be the trace function root (per step 6 — NOT the SDK/agent call itself)
   - **Inputs** — the shape of the function's inputs, and an explicit note that they're serializable by the SDK's tracing layer. If the natural outer boundary's inputs are unserializable (live browser/runtime objects, HTTP req/res, stream writers, sockets, opaque request contexts), state that here and present the two resolutions from step 6 as part of this workflow's entry: **(a) move the boundary inward to `<specific inner function with serializable inputs>`** (recommended when an obvious candidate exists — not a refactor), or **(b) refactor**. Do not proceed to step 9 until the user picks one — never instrument an unserializable root. **If the user picks (b), present a refactor plan — labeled as *visibility* (extract + export, logic unchanged) or *structural* (new pure-core fn) — and get an explicit second confirmation before modifying code. See the "Refactor confirmation" rule below.**
   - **What's covered end-to-end** — the work above, alongside, and below any agent/LLM/SDK call that this trace will capture (be specific: list the orchestration, custom LLM calls, tools, downstream services that will become spans)
   - **Why tracing it is valuable**

   The description must commit to the actual scope. If the plan will only auto-capture an SDK's internals, say so explicitly — do NOT use language like "complete tracing of X workflow" when the trace will only cover an SDK call's internals.

   Recommend one to start with. **Ask the user to pick exactly ONE workflow to instrument first.** Never accept "multiple" or "all" — each Instrument cycle produces exactly one trace function with one trace plan and one set of code changes. If the user wants to instrument several, they will be done sequentially via the loop in step 13, one at a time.
9. **Read function signatures you'll reference in the trace plan** — root function first, then any whose parameter names or return fields aren't already obvious from the step 7 scan. Skipped leaf functions only need their names; don't Read them unless their shape appears in the plan. Never guess names. See "Trace Plan Format" and "Trace Plan Accuracy" in the Reference section below.
10. **Build the trace plan under a hard constraint: the resulting instrumentation must be purely additive.** If a candidate tree requires *any* behavior change to make spans nest correctly (awaiting a stream that wasn't awaited, delaying a call, reordering operations, blocking a callback, restructuring control flow), the tree is invalid — restructure the *tree* instead (make spans siblings, split into separate trace functions across separate cycles, or accept a flatter shape). Never present a behavior-changing approach as an option, not even as a non-recommended alternative.

    **For trace processor SDKs (OpenAI Agents SDK, etc.) — extend beyond the processor.** The processor only auto-captures what runs *inside* the SDK's instrumented call (LLM calls, tool calls, handoffs). Everything above it (orchestration, retries, input prep), alongside it (non-SDK LLM calls, unregistered tools, downstream services), and below it (post-processing, persistence) is invisible unless you add manual spans. Default to a **hybrid plan**: trace function root wraps the workflow with manual `●` spans, the SDK call appears as one `(agent)` child whose grandchildren are `[auto]` lines, and other manual spans capture the work around it. A bare auto-only plan (root = the SDK call, no surrounding manual spans) is only valid when the workflow truly is just the SDK call with no surrounding work — confirm there's nothing meaningful above/alongside/below before defaulting to it.

    Then present the trace plan **using the format defined in the "Trace Plan Format" reference section below** (legend → grammar → template precedence → canonical example). **STOP** — use AskUserQuestion to confirm before writing code.
11. Instrument following the SDK reference exactly — purely additive. Never change behavior, arguments, return values, error handling, variable names, types, control flow, or code structure. Batch repetitive edits in parallel (one message, many Edit calls); for large mechanical fan-outs (>10 files of the same wrapper pattern), validate the pattern on one file, then delegate the rest to a subagent.
12. Tell the user how to run the app to generate the first trace — give exact command(s). Do NOT run it yourself.
13. **MANDATORY STOP — never silently end the cycle without the A/B/C/D prompt.** Check whether traces already exist for the current trace function key via `mcp__plugin_bitfab_Bitfab__search_traces` (or `list_trace_functions`) — the **only** place the skill calls these tools. An empty result is expected (the user hasn't run the app yet) and means "offer option A," not "skip step 13." Then use AskUserQuestion:
    > We recommend **A**: generate traces before instrumenting the next workflows - [one-line reason].
    >
    > A) **Generate traces [current workflow]** — [present the script to run to the user. Allow them to let you to run it for them.] *(omit if traces already exist)*
    > B) **Instrument [next workflow]** — [why it's the next highest value]
    > C) **Instrument [other workflow]** — [alternative]
    > D) **Done instrumenting — proceed to Replay** (in `all` mode) / **Done** (in `instrument` mode)

    A, B, and C all return to step 8 for the selected workflow. Only D exits the Instrument loop.

    **After D in `all` mode, Replay ALWAYS runs.** Replay does not depend on traces existing — replay scripts are built from trace function keys in the instrumented code, not captured trace data. Do not skip Replay because no traces are available. In `instrument` mode, D stops after the Instrument loop.

### Refactor confirmation (applies to step 8 and Replay step 5)

Whenever the user picks "refactor to extract a pure core" (or any option that modifies existing functions/call sites, not just adds new wrappers), you must:

1. **Build a refactor plan** listing:
   - **Flavor** — **visibility** (extract + export, logic unchanged) or **structural** (new pure-core fn with serializable inputs, may require callers to construct them). Most cases are visibility.
   - **Source** — the function(s) that will be modified, with file path and current signature
   - **Extraction** — the new function name, its signature, and (for visibility refactors) an explicit note that the logic moves unchanged
   - **Trace wrap** — which function will carry the `getFunction(...)` / SDK trace wrap after the refactor
   - **Call sites** — every caller that will be rewritten, with file path and line range

2. **Present the plan verbatim** to the user, in the same format above.

3. **AskUserQuestion** with exactly two options:
   - **"Apply refactor"** — proceed to write the changes
   - **"Cancel"** — return to the previous AskUserQuestion (step 8's (a)/(b), or Replay step 5's three-option prompt) so the user can pick a different resolution

Never modify existing code on a refactor path without completing this three-step confirmation. Adding new instrumentation wrappers to unchanged functions is not a refactor — this rule does not apply to step 11's purely-additive instrumentation.

---

## Modify

Adjust an **existing** trace setup. Requires existing SDK usage in the codebase — if none exists, run Instrument first. Triggered explicitly by `/bitfab-setup modify`, or selected from the AskUserQuestion at Instrument step 2 when existing SDK usage is found.

Every Modify cycle targets **exactly one** trace function and picks **exactly one** of five directions. Never batch multiple trace functions or mix directions in one cycle — if the user wants more, loop via the step 9 menu.

1. **Gather existing trace functions** by searching for SDK patterns (`getFunction("key")`, `get_function("key")`, `bitfab_function "key"`, `WithFunctionName("key")`). List each key alongside its root function. If none are found, tell the user Modify needs existing instrumentation and suggest `/bitfab-setup instrument`.
2. **Pick exactly ONE trace function to modify.** Use AskUserQuestion with the list of existing keys. Recommend the one the user most recently instrumented (or the one most recently referenced in the current session) and explain why in one line.
3. **Reconstruct the current trace plan.** Read the instrumented files to map the existing span tree. Render it as the "before" plan using the Default view template from the **Trace Plan Format** reference section. Do not present it yet — it becomes the left-hand side of the diff in step 6.
4. **Pick exactly ONE direction.** Use AskUserQuestion with all five directions below — recommend the one that matches the user's original ask and explain why in one line. Never mix directions in a single cycle.

    | # | Direction | What changes | What must stay the same |
    |---|---|---|---|
    | 1 | **Add context** | Add `addContext`/`setContext`/metadata calls, or insert span(s) between the existing root and an existing descendant, without changing the root or the deepest leaf | Root, deepest leaf, overall depth |
    | 2 | **Increase depth** | Wrap currently-skipped callees inside existing spans as new instrumented children (new leaves deeper in the tree) | Root, existing siblings at each level |
    | 3 | **Reduce depth** | Remove `withSpan`/`@span` wrappers from the deepest instrumented spans, or un-nest them into siblings of their parent | Root, the underlying function call (arguments, return value, control flow) |
    | 4 | **Move root upstream** | Replace the root with a **caller** of the current root (wider scope) | All existing descendants remain under the new root |
    | 5 | **Move root downstream** | Replace the root with a **callee** of the current root (narrower scope) | Interesting LLM/tool activity still sits under the new root |

5. **Build the modified trace plan under the same PURELY ADDITIVE constraint as Instrument step 10.** The modified tree must be implementable without behavior changes. If the chosen direction requires awaiting a stream that wasn't awaited, delaying a call, reordering operations, blocking a callback, or restructuring control flow, the direction is invalid for this cycle — tell the user which direction doesn't fit and why, then return to step 4 for a different direction (or suggest splitting into multiple cycles). Never present a behavior-changing approach as an option.

    Direction-specific rules:
    - **Add context** — list the exact context keys/values to capture and the span they attach to. If inserting an intermediate span, read the intermediate function's signature for accurate parameter/return names.
    - **Increase depth** — read the signatures of the callees you'll wrap. Each new span needs a type annotation (`function`, `llm`, `tool`, `agent`, `handoff`).
    - **Reduce depth** — list each span to remove by name. Removing a wrapper must not delete any real function call — removing an instrumented wrapper leaves the underlying call in place.
    - **Move root upstream** — read the new caller's signature. The new root must still be a common ancestor of every existing LLM/tool span; if the caller fans out to parallel work unrelated to this trace function, upstream is invalid.
    - **Move root downstream** — the new root must still cover the interesting LLM/tool activity. If critical LLM spans live outside the downstream callee, downstream is invalid.

6. **Present a before/after diff** using the **Trace Plan Format** reference section:

    ```
    Before:
    <current default-view trace plan>

    After:
    <modified default-view trace plan>
    ```

   Below the two plans, list `Files changed:` for the edits this cycle will make — paths only, no annotations. **STOP** — use AskUserQuestion: **Proceed** (recommended) / **Expand details** (re-render both plans in the expanded view) / **Adjust** (user wants changes — ask what) / **Cancel**.

7. **Decide the trace function key.** Directions 1–3 always keep the existing key. Directions 4–5 change the root function, so the existing key may no longer describe it. Use AskUserQuestion:
   - **Keep key `<existing>`** — new traces continue to aggregate with historical traces on the same key (recommended when the new root plays the same role)
   - **Rename to `<suggested-new-key>`** — starts a fresh trace function. Historical traces on the old key are preserved but will not appear under the new key.

   Skip this step for directions 1–3.

8. **Apply the changes — purely additive to behavior.** Same rules as Instrument step 11: never change arguments, return values, error handling, variable names, types, control flow, or code structure. Removing a `withSpan`/`@span` wrapper (direction 3) is the only structural edit allowed, and only when it leaves the wrapped call, its arguments, and its return value untouched. Batch repetitive edits in parallel (one message, many Edit calls).

9. Tell the user how to run the app to generate a trace with the modified setup — exact command(s). Do NOT run it yourself. Then **MANDATORY STOP** — use AskUserQuestion:
    > We recommend **A**: generate a trace with the modified setup so the diff is observable end-to-end.
    >
    > A) **Generate a trace for the modified setup** — [present the script to run; allow the user to let you run it]
    > B) **Modify another trace function** — returns to step 2
    > C) **Done** — stop here

    B returns to step 2. A and C exit the Modify loop. After exit, stop (Modify does not auto-continue to Replay — the user can invoke `/bitfab-setup replay` separately).

---

## Replay

Create or update replay scripts for instrumented trace functions. Requires instrumentation in the codebase; does **not** require existing traces — replay scripts are created from trace function keys in the code, not captured trace data.

Replay scripts let the team regression-test any trace function against production data with one command — they fetch historical traces, re-run them through the current code, and report old vs. new outputs side-by-side. Note: **Go does not support replay** — skip this phase if the project is Go-only.

**Source of truth:** https://docs.bitfab.ai/<language>-sdk#replay (e.g. `/typescript-sdk#replay`, `/python-sdk#replay`, `/ruby-sdk#replay`). That page has the API signature, a copy-pasteable example `scripts/replay.<ext>`, the **replay output contract** (what to print to stdout), and the **input serialization caveat**. **Read it before creating or modifying a replay script** — do not improvise the script shape from memory. If you need anything else about the SDK beyond what the Instrument phase covered, the rest of `docs.bitfab.ai/<language>-sdk` is the reference.

1. **Gather all trace function keys** by searching for SDK patterns (`getFunction("key")`, `get_function("key")`, `bitfab_function "key"`, `WithFunctionName("key")`). This is the source of truth for what replay must cover.
2. **Search for existing replay scripts** — files matching `scripts/replay.*`, `scripts/*replay*`, or any file importing/calling the SDK's replay API.
3. **Compare coverage.** Replay is non-interactive once entered — do not ask the user whether to create or add scripts:
   - If replay scripts exist and cover all keys: verify each one already conforms to the Replay Output Contract in the docs (prints full original and new values to stdout — never just counts). If any don't, fix them; otherwise report up to date and stop.
   - If replay scripts exist but are missing trace function keys: add the missing scripts in step 4.
   - If no replay scripts exist: create them in step 4.
4. **Create the replay script** following the example in the SDK reference's Replay section (https://docs.bitfab.ai/<language>-sdk#replay), adapted to this codebase. The non-negotiables (enforced by the docs page, repeated here so the script review catches them):
   - **Ground the script in the docs, not memory.** Before writing the replay call, fetch `https://docs.bitfab.ai/<language>-sdk#replay` and quote the exact function signature + return-shape fields verbatim in your plan. Field names differ per language (Python: `result`, `original_output`; TypeScript: `result`, `originalOutput`; Ruby: `:result`, `:original_output`) — do not paraphrase or invent names like `new_output`/`trace_id`.
   - **Pass the decorated function itself, not an undecorated wrapper.** The trace function key is read from the decorator/attribute on the function you pass in. For Python class methods, pass `Class.method` (or a bound `instance.method`). For TypeScript, the key is passed as a string arg alongside the function — use the exact key from the instrumented code. For Ruby, pass `receiver` + `method_name:` + `trace_function_key:` matching the `traceable` decoration.
   - **Use the same `Bitfab` client across instrumentation and replay.** Import it from the instrumented module (or a shared singleton) — never construct a second client inside the replay script, or registered trace functions won't resolve.
   - Accept a pipeline name as a CLI argument
   - Accept optional `--limit N` (default 10) and `--trace-ids id1,id2` flags
   - Map pipeline names to trace function keys and their replay functions
   - **Each pipeline's replay function MUST import and call the actual instrumented function** — never a stub or identity function. If the function signature doesn't match the raw input shape, reshape arguments in the wrapper.
   - **Replay runs in the app's environment.** The script imports the app as a library — DB clients, env vars, config loaders, and model IDs resolve from the loaded environment. Do **not** mock them. Run the script with `.env` loaded (e.g. `pnpm with-env tsx scripts/replay.ts`, `dotenv run -- python scripts/replay.py`, or the project's equivalent) so the app's normal bootstrap applies.
   - **Only mock what has no live counterpart at replay time.** For factory-created instrumented functions (taking session, stream writers via closure), the wrapper passes:
     - Stream/socket writers: no-op (`{ write: () => {}, merge: () => {} }`) — no client on the other end
     - Session/request identifiers: minimal stub with the fields the function reads
   - **Caveat: watch for module-level import side effects.** Importing the instrumented function transitively runs the app's module initialization — if that opens listeners, binds ports, or connects to prod, the replay script inherits it. When in doubt, confirm the replay env points at a staging/local DB before running.
   - **Follow the docs' Replay Output Contract**: for each item, print the full original and full new output values to stdout (serialize non-strings to JSON). Never print only lengths, counts, hashes, or truncated previews — subagents reading the output can't reason from `5 → 7 (+2)`.
   - Print a summary (total replayed, same, changed, errors) and the test run URL
   - Live in a `scripts/` directory (or the project's existing scripts location)
5. **Safety net for legacy instrumentation.** If an already-instrumented function (introduced before step 6's serializability gate, or via another path) can't be invoked from the replay script — most commonly because it isn't exported, is defined inline in a route handler, or takes unserializable inputs — use AskUserQuestion offering step 6's two resolutions: **"Move trace boundary inward"** or **"Refactor" (Recommended)**. If the user declines both, fall back to **"Leave as-is"** — add a header comment noting why the function isn't callable and flag that the script will rot. Reason from the function's signature and visibility; do not execute the script to detect this. **If the user picks "Refactor" (or a boundary move that requires rewriting callers), apply the "Refactor confirmation" rule above — present a refactor plan labeled as *visibility* or *structural* and get a second confirmation before modifying code.**

---

## Reference

These sections are consulted during the Instrument phase — not executed sequentially.

### Trace Plan Format

The trace plan is a strict format. Do not improvise — follow the legend, grammar, and template selection rule below. When in doubt, copy the matching canonical example verbatim and substitute names.

#### Legend

| Symbol | Meaning | Where it appears |
|---|---|---|
| `●` | Instrumented span | Default + Expanded + Processor views |
| `○` | Skipped function (not instrumented) | Only when the expand modifier is applied (on top of any base template) |
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
7. **Footer** — one blank line, then one or both of:
   - `Files changed:` followed by a numbered list (any plan with manual `●` spans)
   - `Setup: <one-line setup description>` (any plan that registers a trace processor)
   Hybrid plans (manual spans + processor) include both, with `Setup:` first then `Files changed:`. A pure-processor plan with no manual spans includes only `Setup:`. A pure-manual plan with no processor includes only `Files changed:`.
8. **No descriptions, no counts, no parameter details, no blank lines between siblings, no trailing whitespace.**
9. **One trace function per plan.** A trace plan describes exactly one trace function — exactly one `Trace function: "..."` header, exactly one `[root]`, exactly one tree, exactly one `Files changed:` section. If the cycle would require instrumenting two trace functions, that's two cycles, not one plan with two trees.

#### Which template to use (precedence — check top to bottom, stop at first match)

Pick the **base template** from SDK capability and surrounding work:

1. **Trace processor (hybrid) template** — if the SDK guide says to register a processor (e.g. OpenAI Agents SDK `addTraceProcessor`) AND there is meaningful work above, alongside, or below the SDK call. The trace function root wraps the broader workflow with manual `●` spans; the SDK call appears as one `(agent)` child whose grandchildren are the `[auto]` lines; other manual spans capture work outside the SDK. This is the default for any trace processor SDK whenever there's surrounding workflow logic — which is almost always.
2. **Trace processor (bare) template** — only when the workflow truly is *just* the SDK call with no surrounding work. Children of the root span are auto-captured and shown as `[auto]` lines. Confirm before using this — if the workflow has any input prep, orchestration, retries, post-processing, or non-SDK LLM/tool calls, use the hybrid template instead.
3. **Default view** — every other case (no processor in play). This is the recommended default for SDKs without a processor.

Then apply the **expand modifier**, orthogonally:

- If the user explicitly asks for more detail ("show details", "expand", "include skipped") or selects "Expand details" from the AskUserQuestion preview, add `○` skipped lines to whichever base template was picked. Never drop `[auto]` lines when expanding a processor template — skipped lines and auto-captured lines coexist in the tree. Without an explicit ask, do not add skipped lines.

Never mix base templates beyond the hybrid pattern. Never invent a fifth variant.

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

**Default + expand modifier** — adds skipped (○) functions in true execution order. The same modifier applies to processor templates (hybrid or bare) when the user asks for expansion — `○` lines coexist with `[auto]` lines in that case:

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

**Trace-processor (hybrid) view** — workflow with manual spans wrapping auto-captured agent internals (default for processor SDKs):

```
Trace function: "handle-user-request"

[root]
● handleUserRequest (function)
├─ ● validateAndPrepareInput (function)
├─ ● runAgent (agent)
│  ├─ LLM calls    [auto]
│  ├─ tool calls   [auto]
│  └─ handoffs     [auto]
├─ ● scoreAgentOutput (llm)
└─ ● persistResult (function)

Setup: addTraceProcessor(processor) registered at startup
Files changed:
  1. handler.ts
  2. tracing/setup.ts
```

The `[auto]` lines are auto-captured spans — the processor emits them inside the SDK call without manual instrumentation. They use `├─`/`└─` like normal children but carry no `●`/`○` symbol because you're not writing the span yourself. Manual `●` spans wrap the broader workflow above, alongside, and below the SDK call.

**Trace-processor (bare) view** — only when the workflow IS just the SDK call:

```
Trace function: "my-agent"

[root]
● runAgent (function)
├─ LLM calls    [auto]
├─ tool calls   [auto]
└─ handoffs     [auto]

Setup: addTraceProcessor(processor) registered at startup
```

Use this **only** when there is genuinely no work above, alongside, or below the SDK call. If there's any input prep, orchestration, retry, post-processing, or non-SDK LLM/tool call, use the hybrid view instead.

#### Anti-examples (do NOT do these)

- ❌ `* outerFunction (function)` — use `●`, never `*` or `-` or `•`
- ❌ `● outerFunction` — type annotation is mandatory on every instrumented span
- ❌ `● outerFunction (function) — calls the LLM with retries` — no descriptions, no em dashes
- ❌ `● outerFunction (llm-call)` — only the listed types are valid; do not invent new ones
- ❌ `[Root]` or `[ROOT]` — literal label is lowercase `[root]`
- ❌ Mixed indentation widths (2 spaces in one branch, 4 in another)
- ❌ Blank lines between siblings inside the tree
- ❌ Omitting `Files changed:` from any plan that has manual `●` spans (hybrid trace-processor plans MUST include both `Setup:` and `Files changed:`)
- ❌ Defaulting to the bare trace-processor view when the workflow has work above, alongside, or below the SDK call — use the hybrid view and add manual spans
- ❌ Putting the SDK's agent call (e.g. `runAgent`, `Runner.run`) at `[root]` when the actual workflow has a clear outer function — the workflow function is the root, the SDK call is a child
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
