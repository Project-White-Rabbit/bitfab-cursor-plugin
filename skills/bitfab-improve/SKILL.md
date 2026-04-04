---
name: bitfab-improve
description: "Improve a traced function with Bitfab. Usage: /bitfab-improve <trace-function-key>"
---

# Bitfab Improve

Use the **local plugin MCP tools** (`mcp__plugin_bitfab_Bitfab__*`) to find what's failing in a traced function, gather labeled failed traces, then iterate on the code/prompts using replay until pass rates improve.

**MCP tools:** This skill uses `list_trace_functions`, `search_traces`, and `read_traces` from the **local plugin MCP server** (bundled with this plugin). Do NOT use the remote Bitfab MCP tools (`mcp__Simforge__*` or `mcp__Bitfab__*`) — use only the `mcp__plugin_bitfab_Bitfab__*` variants.

**Always use** `AskUserQuestion` **when asking questions, reporting results, or presenting choices.** Never print a question as text and wait. Rules:

- Recommend an option first, explain why in one line
- Present 2-5 concrete options
- One decision per question — never batch

## Phase 1: Identify the Trace Function

If a `traceFunctionKey` was provided as an argument, use it. Otherwise:

1. Call `mcp__plugin_bitfab_Bitfab__list_trace_functions` to list all available trace functions
2. For each function, include a brief description of what it does — infer from the function key name (e.g., `memory-search` → searches memories, `memory-extraction` → extracts memories from conversations). Keep descriptions to one sentence.
3. Present the list to the user with names, descriptions, and evaluation stats (grader count, pass/fail numbers)
4. Use `AskUserQuestion` to ask which one they want to improve — recommend the one with the most signal (graders + failures) — wait for their answer before continuing

## Phase 2: Verify Instrumentation & Replay

Check that this trace function has both instrumentation and a replay script.

### Check Instrumentation

Search the codebase for the trace function key to confirm SDK usage:

- TypeScript: `grep -r "<traceFunctionKey>" --include="*.ts" --include="*.tsx"`
- Python: `grep -r "<traceFunctionKey>" --include="*.py"`
- Ruby: `grep -r "<traceFunctionKey>" --include="*.rb"`
- Go: `grep -r "<traceFunctionKey>" --include="*.go"`

If the trace function key is NOT found in the codebase, use `AskUserQuestion` to ask the user:

> "I can't find instrumentation for `<traceFunctionKey>` in this codebase."
>
> Options: "Instrument now (Recommended)" — set up tracing inline / "Pick a different function" / "Stop"

If the user chooses **"Instrument now"**, invoke `/bitfab-setup instrument`, then continue with Phase 2 Check Replay Script.

### Check Replay Script

Search for a replay script that covers this trace function:

- Look for files matching `scripts/replay.*`, `scripts/*replay*`, or any file that imports `bitfab.replay` / `client.replay`
- Read the script and check that it maps the target trace function key

If no replay script exists or it doesn't cover this function, use `AskUserQuestion` to ask the user:

> "No replay script found for `<traceFunctionKey>`."
>
> Options: "Create replay now (Recommended)" — create the replay script inline / "Pick a different function" / "Stop"

If the user chooses **"Create replay now"**, invoke `/bitfab-setup replay`, then continue with Phase 3.

## Phase 3: Build Dataset & Establish Expected Outcomes

Build an in-context dataset of traces with approved expected outcomes. The user's judgment is the grader in v0 — this dataset becomes the benchmark for all experiments.

1. **Find traces** — Use `mcp__plugin_bitfab_Bitfab__search_traces` to find failed or interesting traces. Prioritize human-labeled failures, then automated grader failures with diagnostics, then recent traces with unusual outputs.
2. **Present a trace** — Pick one notable trace. Call `mcp__plugin_bitfab_Bitfab__read_traces` with `scope: "full"`, then use `AskUserQuestion` to show the user the input and actual output.
3. **Get the user's judgment** — Ask: is this a failure? If so, what should the correct output be? Record their expected outcome and reasoning.
4. **Filter and update** — Drop or update traces and their expected outcomes based on the users feedback. Identify duplicates that may not be needed in the dataset after user feedback. This dataset is used by an intelligent agent so minor input discrepancies are often handled unlike training a model.
5. **Repeat 1–4** Based on user feedback, you may start the loop at 1 or 2 until the dataset has enough approved traces to generate useful code fixes. Don't rush — one trace at a time keeps feedback focused.
6. **Confirm the dataset** — Present the full list via `AskUserQuestion`: each entry showing (trace ID, actual output, expected outcome, user's reasoning). Get explicit approval before moving on.
7. **Hold in-context** — This approved dataset is the benchmark for all experiments in Phase 5. Keep it in your working context throughout.

## Phase 4: Diagnose & Plan

### Step 1: Understand Failures

Using the failed traces you read in Phase 3 (or read them now if you haven't):

1. Call `mcp__plugin_bitfab_Bitfab__read_traces` on 3–5 failed traces with `scope: "full"`

Synthesize the failure patterns — what's going wrong, what the common threads are.

### Step 2: Read the Code

1. Find the instrumented function in the codebase (you found it in Phase 2)
2. Read the full implementation — follow the call chain to understand the logic
3. Identify **iteration targets**: prompts, system messages, parameters, preprocessing, postprocessing
4. If BAML files are involved, read the relevant `.baml` files

### Step 3: Analyze dataset discrepancy between actual and expected in dataset

Based on the failure patterns, the code, and the approved dataset from Phase 3, categorize proposed changes into three buckets:

**Bucket 1 — Code fixes**: Deterministic bugs (off-by-one, type mismatch, missing null check, wrong variable). These won't recur once fixed. Bundle all code fixes into a single experiment unless they are large feature changes. These are applied first as a foundation that all subsequent experiments build on.

**Bucket 2 — Judgment-based fixes**: Prompt changes, context truncation, search tuning, output formatting, etc. These require the user's judgment to evaluate correctness. Each gets its own experiment.

**Bucket 3 — Infrastructure proposals**: Larger changes that require new infrastructure, architectural changes, or significant feature work. These are separated out because experiments become harder to compare when some include large infra changes and others don't — apples-to-apples comparison requires a consistent baseline. Do not run experiments for these. Instead, if the user has integrations (Linear, Notion, Jira), propose creating a task with a clear writeup for future work.

Present the categorized plan via `AskUserQuestion`:

> "Based on the N traces in the dataset, here's what I see: \*\***Code fixes** (experiment #1 — bundled):
>
> - \[Fix\]: \[What and why, which traces it addresses\] \*\***Judgment-based experiments** (#2, #3, ...):
>
> - \[Experiment\]: \[What change, which traces it targets, hypothesis\] \*\***Future infrastructure** (not experiments):
>
> - \[Proposal\]: \[What it would require, which traces it would help\]
>
> I'll replay each experiment against the approved dataset and compare outputs to the expected outcomes we agreed on."

Get the user's confirmation before proceeding.

## Phase 5: Iterate with Replay

Run an iterative improvement loop. Fork as many experiments that do not rely on sequential results to subagents using the **Agent tool** with isolation: "worktree". Each iteration:

### Step 1: Make the Change

1. Use `AskUserQuestion` to explain what you're changing and why, and confirm before editing

2. Edit the iteration target (prompt, code, tools, parameters)

### Step 2: Replay Against Dataset

Collect the trace IDs from the approved dataset (Phase 3). Run the replay script with those specific traces.

```bash
# The exact command depends on the replay script — adapt to what exists
# Example for TypeScript:
cd <project-dir> && npx tsx scripts/replay.ts <pipeline-name> --trace-ids <id1>,<id2>,<id3>,...
```

### Step 3: Evaluate Against Expected Outcomes

Read the replay output. Compare each trace's new output against the **expected outcomes approved in Phase 3**. For each trace in the dataset:

- Does the new output match (or move closer to) the expected outcome?
- Did any previously-passing traces regress?
- Reason for any results changing?
- Record the results into a tmp file if the dataset/context is too big so you can recall it later easily.
- Return the results of the sub agent if you are in one to the main agent.

### **Step 4: Share Results to the user**

> "After N experiments these are the results: X/Y traces now match expected outcomes.
>
> - ✅ Trace `abc123`: Now matches expected — \[brief comparison\]
> - ❌ Trace `def456`: Still diverges — expected \[X\], got \[Y\]
> - ❌⚠️ Trace `ghi789`: Was passing, now failing (regression)"
>
> Show this across the full data set, and highlight the best out come concisely. Explain why it worked best with references to code, docs, and/or research if needed. For the best outcome:
>
> - **If pass rate improved and no regressions**: Use `AskUserQuestion` to ask the user if they want to keep iterating or stop
> - **If pass rate improved but regressions exist or no improvement**: Use `AskUserQuestion` to tell the user and propose to create a plan for new experiments and continue iterating.
>
> Ensure the `AskUserQuestion` you ask includes your recommended next step.

## Phase 6: Validate & Wrap Up

### Step 1: Summary

Use `AskUserQuestion` to present the final results similar to this. You may expand where appropriate based on context from the user:

> "**Improvement summary for** `<traceFunctionKey>`:
>
> - Failed traces fixed: X/Y (from N% → M% pass rate on labeled failures)
> - Full replay pass rate: A/B
> - Changes made:
>   - \[File\]: \[Description of change\]
>   - \[File\]: \[Description of change\]
>
> The changes are in your working tree (not committed). Review the diffs and commit when ready."
