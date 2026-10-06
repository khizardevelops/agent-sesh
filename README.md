# 🧠 agent-sesh

> **Never start an AI coding session from scratch again.** `agent-sesh` generates a persistent "Project Brain" in your workspace. It solves the "Context Amnesia" problem by creating a standardised `.agents/handoff/` directory and root pointer files — `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`… one per agent you use — that tell AIs to read and maintain that context.

[![npm version](https://img.shields.io/npm/v/agent-sesh.svg)](https://www.npmjs.com/package/agent-sesh)
[![npm downloads](https://img.shields.io/npm/dm/agent-sesh.svg)](https://www.npmjs.com/package/agent-sesh)
[![npm license](https://img.shields.io/npm/l/agent-sesh.svg)](https://www.npmjs.com/package/agent-sesh)
[![test](https://github.com/khizardevelops/agent-sesh/actions/workflows/test.yml/badge.svg)](https://github.com/khizardevelops/agent-sesh/actions/workflows/test.yml)

```bash
npx agent-sesh@latest
```

Works with **Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Gemini CLI, Windsurf, Zed, Cline, Qwen Code** and [67 more](#supported-agents) — every agent the [`skills`](https://github.com/vercel-labs/skills) CLI supports, and it never touches the skills that CLI installs. `npx agent-sesh --agents` prints the full list.

---

## What exact problem does this solve?

**Every AI coding session starts at zero. Your project doesn't.**

The knowledge that actually makes an agent useful — why the auth layer is structured that way, which library you already tried and rejected, what's half-finished, what must never change — lives in your head and in a closed chat window. So every session you pay the same tax:

| The symptom | What it costs you |
| --- | --- |
| Re-explaining architecture at the start of every chat | 10–15 minutes and a chunk of your context window, every single time |
| The agent re-suggests a library you rejected three sessions ago | You re-litigate a settled decision |
| The agent "fixes" deliberate code because it can't see the reason | Silent regressions in code that was correct |
| The agent leaves work half-done and the next chat can't tell what happened | Duplicated or abandoned work |
| You switch Claude → GPT → local model | The entire project context is gone again |

**Why the obvious fix doesn't hold.** Most people write one big `AGENTS.md` by hand. It degrades predictably: the agent has no schema, so it appends session notes, changelogs and TODOs into the same file until it's a 900-line dumping ground that's too expensive to read and too stale to trust. Then it gets ignored — by you and by the model.

**agent-sesh makes the context durable instead of disposable:**

1. **A fixed schema, not a blank file.** 15 markdown files — an index plus 14 that each own exactly one concern, sorted into `memory/` (what changes every session), `rules/` (standing guardrails) and `references/` (background and defects). The agent always knows *where* a fact goes, so writes stay small and targeted instead of accreting into one blob.
2. **A protected pointer.** The root pointer files (`AGENTS.md`, `CLAUDE.md`, …) are set read-only (`chmod 444`) and re-locked by git hooks after every pull and checkout — so agents physically cannot turn your entry point into a scratchpad.
3. **An enforced lifecycle.** The pointer instructs every agent to read `.agents/handoff/` before touching code and update it before the session ends.
4. **Portability by design.** It's plain markdown in your repo, committed alongside your code. It survives model switches, tool switches, teammates, and `rm -rf node_modules`.

**What it is *not*:** not a memory server, not a vector database, not RAG, not a daemon, not an MCP server. No API keys, no accounts, no network calls, no telemetry. It writes markdown files and exits.

---

## 🔌 How does this fit into my existing tech stack?

**Short answer: it doesn't touch it.** agent-sesh is *dev tooling that sits next to your code*, not a library that runs inside it. You never `npm install` it into your project, never import it, and it never appears in your bundle, your `dependencies`, or your build output. It's `npx`-only — it runs, writes markdown, and exits.

> ⚠️ **Common mix-up:** the "agents" in `agent-sesh` are the *coding assistants working on your repo* (Claude Code, Cursor, Copilot), **not** the LLM agents you build with LangChain or the Vercel AI SDK. agent-sesh is not a competitor to any of those — it's orthogonal to all of them.

| Your stack | Does agent-sesh touch it? | What it does for you |
| --- | --- | --- |
| **Next.js / React / Vite / Remix** | ❌ No build step, no config, no plugin, no `next.config.js` change | Records your App Router vs Pages decision, RSC boundaries, and which routes are edge vs node — so the agent stops guessing |
| **Vercel AI SDK** | ❌ Not a dependency, not imported | Pins down which model you're on, why you chose `streamText` over `generateText`, and your tool-calling conventions |
| **LangChain / LlamaIndex** | ❌ No overlap — that's runtime orchestration, this is dev-time docs | Captures your chain/graph topology and retrieval strategy so an agent doesn't redesign it mid-refactor |
| **OpenAI / Anthropic SDKs** | ❌ No API keys, no network calls, ever | Documents model IDs, fallback behaviour, rate-limit handling, and cost constraints in `rules/constraints.md` |
| **TypeScript, Python, Go, Rust, anything** | ❌ Language-agnostic — it's markdown | Same brain, any runtime |

**The complete list of what it creates or edits in your repo:**

- `.agents/handoff/` — 15 markdown files in three folders (created once, then owned by you and your agents). The rest of `.agents/`, including `skills/`, is left alone.
- Root pointer files — `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `QWEN.md`, `IFLOW.md` — one for each environment you tick
- Two local git hooks (`post-merge`, `post-checkout`), appended between markers so your Husky / LFS / custom hooks stay intact

That's it. Your `package.json`, lockfile, source tree, CI config and build pipeline are never modified. Its dependencies ([`@clack/prompts`](https://www.npmjs.com/package/@clack/prompts) and the [`@clack/core`](https://www.npmjs.com/package/@clack/core) engine it is built on, for the interactive CLI) live inside the `npx` cache and never reach your app.

**Why AI-heavy stacks benefit most:** an LLM app carries an unusual amount of knowledge that isn't visible in the code — *why* the temperature is `0.2`, *why* streaming is chunked that way, which prompt version regressed, which model you moved off and what broke. That's exactly what `memory/decisions.md`, `references/assumptions.md` and `references/known-issues.md` exist to hold.

---

## 💻 What does the code look like?

There's no API to import and nothing to wire up — **the "code" is one command and the markdown it writes.**

**1. Run it** — `npx agent-sesh@latest`, then tick the environments you use. Universal (`AGENTS.md`) is pre-selected; the agents found on your machine are listed so you can add their own files. Full flag reference in [Quick Start](#quick-start) below.

**2. It writes a root pointer file per environment** — this is the full generated `AGENTS.md`; `CLAUDE.md` and the rest are the same text, talking about themselves
(soft-wrapped here for width):

```markdown
# Agent Instructions

This project uses `.agents/handoff/` as its agent memory and handoff folder.

IMPORTANT: Do not edit this AGENTS.md file for project memory, state, tasks,
decisions, or handoff notes. This file is only a pointer. Put all project
memory updates in `.agents/handoff/`.

IMPORTANT: Never rename, move, or delete any folder or file inside
`.agents/handoff/`, and never delete files there to clean up or start fresh.
The layout is fixed; edit file contents only.

Before making changes:
1. Read `.agents/handoff/README.md`.
2. Read every active standard file in `.agents/handoff/memory/`,
   `.agents/handoff/rules/`, and `.agents/handoff/references/`.
   Do not recursively read `.agents/handoff/archive/`; open a specific
   snapshot only when the task needs historical context.
3. Treat `.agents/handoff/memory/state.md`, `.agents/handoff/memory/tasks.md`,
   and `.agents/handoff/memory/last-session.md` as the primary session state.
4. Keep the relevant files in `.agents/handoff/` updated before ending the
   session.

`.agents/` is a shared folder. `.agents/skills/` holds skills installed with
`npx skills`: on-demand instructions, not session state. Anything else beside
`handoff/` belongs to the user or to other tools. Read it when a task calls for
it, but never treat it as session state and never write session state into it.

Do not skip the `.agents/handoff/` files. Do not write session state into
AGENTS.md. The `.agents/handoff/` folder is the source of truth for agent
context in this project.
```

**3. And it scaffolds `.agents/handoff/` with a heading-only skeleton** — every file ships as prompts for the agent to fill in, so it knows exactly where each kind of fact belongs. Here's the generated `memory/state.md`:

```markdown
<!-- agent-sesh: never rename, move or delete this file or its folder. Edit the content only. See .agents/handoff/README.md. -->

# State

Describe how the project works right now. Keep this present-tense and accurate.
Include runtime behavior, important components, and data flow here.

## Current State

## Implemented

## Missing Or Partial

## Invariants

<!-- End-to-end flow belongs in pipeline.md, not here. -->
```

**4. After a session or two, it looks like this** — a real `memory/state.md` from a Next.js + Vercel AI SDK + LangChain app:

```markdown
# State

## Current State
Next.js 15 App Router. Chat streams from `app/api/chat/route.ts` (edge runtime)
via Vercel AI SDK `streamText`. Retrieval runs through a LangChain retriever
over pgvector on Supabase.

## Implemented
- Streaming chat + tool calls (`getWeather`, `searchDocs`)
- Retrieval pipeline: chunk → embed (`text-embedding-3-small`) → pgvector
- Rate limiting via Upstash, keyed on user ID

## Missing Or Partial
- Conversation persistence is client-side only; DB schema drafted, not wired
- No eval harness — prompt regressions are caught by hand

## Invariants
- Chat route MUST stay on edge runtime (Node runtime breaks streaming on Vercel)
- Never call the OpenAI SDK directly — everything goes through the AI SDK layer
```

**5. Then start every session by tagging the pointer:**

```txt
@AGENTS.md add citation links to the retrieval results
```

The agent reads the brain, does the work with full context, and updates `.agents/handoff/` before it finishes. Next session — new chat, new model, new machine — picks up exactly where you left off.

---

## Quick Start
```bash
# Interactive: tick the environments you use (Universal is pre-selected)
npx agent-sesh@latest

# Or say which pointer files you want. Flags combine.
npx agent-sesh --uni              # Universal — AGENTS.md (Codex, Cursor, Copilot, OpenCode…)
npx agent-sesh --claude           # Claude Code — CLAUDE.md
npx agent-sesh --gemini           # Gemini CLI — GEMINI.md
npx agent-sesh --qwen             # Qwen Code — QWEN.md
npx agent-sesh --iflow            # iFlow CLI — IFLOW.md
npx agent-sesh --uni --claude     # both, in one run

npx agent-sesh --agents           # every supported agent and the file it reads
npx agent-sesh --version          # Print the version
npx agent-sesh --help             # Show all options
```

The interactive run shows you the version it's using, what already exists in the
project — including the skills `npx skills` has installed and the agents found on
your machine — and what it changed:

```txt
┌  🧠 agent-sesh  v#.#.#
│
◇  Workspace
│
│  Project    my-app
│  Location   ~/code/my-app
│  Brain      not set up yet
│  Pointer    none
│  Skills     1 installed · grill-me
│  Agents     Claude Code, Codex, Gemini CLI, OpenCode detected
│  Git        repository detected
│
┣━━━━━━━━━━━━━━──────────╌╌╌╌┄┄
│
◆  Which environments do you want to set up? (space toggles · enter confirms)
│  ◼ 🟢 Universal — AGENTS.md (detected: Codex, OpenCode)
│  ◻ 🟠 Claude Code — CLAUDE.md
│  ◻ 🔵 Gemini CLI — GEMINI.md
│  ◻ 🟣 Qwen Code — QWEN.md
│  ◻ ⚪ iFlow CLI — IFLOW.md
│
◇  Project brain ready in .agents/handoff/
│
◇  Summary
│
│  .agents/handoff/   15 files created
│  AGENTS.md          created
│  protection         read-only
│  git hooks          post-merge, post-checkout
│  skills             1 preserved
│
┣━━━━━━━━━━━━━━──────────╌╌╌╌┄┄
│
◇  Next steps
│
│  1  Start your AI session with @AGENTS.md
│  2  Fill in .agents/handoff/references/overview.md
│  3  Keep .agents/handoff/memory/ current as you work
│  4  Ask the AI to update .agents/handoff/ before you finish
│
┣━━━━━━━━━━━━━━──────────╌╌╌╌┄┄
│
└  Done — AGENTS.md now points agents at .agents/handoff/
```

Re-running is always safe. When a project is already set up, the first question
offers three things, with a box above them that explains in full whichever one
the cursor is on:

- **⏫ Update** (the default — just press Enter) keeps your content and your
  pointer files and brings them up to date with this version. On a project still
  using an older agent-sesh layout it reads **Upgrade to the new layout**, and
  moves everything into `.agents/handoff/` as described below. This is what you
  want after updating agent-sesh.
- **🔄 Change pointer files** re-opens the checklist with the pointer files you
  already have ticked: tick one more to add it, untick one to retire it.
- **🔵 Start over** archives the brain and begins again from blank templates.

Choosing **Start over** moves the active project brain into a dated
`.agents/handoff/archive/<timestamp>/` snapshot, including a manifest, then
recreates the standard template files from scratch. No root pointer is retired,
and a pointer you have customised is kept exactly as it is; one that does not lead
to `.agents/handoff/` (an older template, or a hand-written file) is refreshed,
with a backup if it had content of its own. Archived material is not part of the
default agent-reading workflow. The archive is scoped to `.agents/handoff/` — anything else in
`.agents/`, `skills/` included, is never part of a snapshot.

Everything hangs off a single guide line on the left, with a fixed-length rule
closing each section — no boxes with a right edge or a full-width rule — so resizing the terminal never breaks the layout, and a
line too long for a narrow window wraps with its guide.

Colour is disabled automatically when output is piped, and honours
[`NO_COLOR`](https://no-color.org). With flags, or in CI and other
non-interactive terminals, the same information prints as plain text.

---

## What It Creates
```txt
project/
├── AGENTS.md                 ← one pointer file per environment you tick
├── CLAUDE.md                 ← (CLAUDE.md, GEMINI.md, QWEN.md, IFLOW.md)
└── .agents/
    ├── handoff/              ← everything agent-sesh owns
    │   ├── README.md
    │   ├── memory/           ← mutable session state
    │   │   ├── state.md
    │   │   ├── pipeline.md
    │   │   ├── tasks.md
    │   │   ├── last-session.md
    │   │   └── decisions.md
    │   ├── rules/            ← standing guardrails: always obey
    │   │   ├── style.md
    │   │   └── constraints.md
    │   └── references/       ← consult when relevant
    │       ├── overview.md
    │       ├── glossary.md
    │       ├── roadmap.md
    │       ├── assumptions.md
    │       ├── bugs.md
    │       ├── known-issues.md
    │       └── commands.md
    └── skills/               ← yours. agent-sesh never creates or touches it
        └── <skill>/SKILL.md
```
The package does not ship a prebuilt `.agents/` folder. These files are generated on the client's computer when `npx agent-sesh` runs.

The folder name is itself an instruction to the agent. **`memory/`** is read first and updated last — what exists now, how work flows through it, what is next, what just happened, what was decided. **`rules/`** is the standing guardrails, to be obeyed and rarely changed; it is deliberately tiny, because a short rules folder is one an agent actually reads every time. **`references/`** is consulted when relevant.

**The layout is fixed.** Agents — Gemini especially — like to tidy up a folder they did not create: renaming files, merging them, deleting the ones that look empty. Every path in `.agents/handoff/` is how agent-sesh and every later session find the brain, so the rule *never rename, move or delete anything in here; edit the contents* is stated in the pointer file, in a section at the top of `.agents/handoff/README.md`, in the `archive/` and `old_agent_files/` READMEs, and in a one-line comment at the top of every template file.

The names follow what the ecosystem already uses: `memory/` from the [.agents](https://github.com/bgreenwell/dotagents) conventions, `rules/` from Cursor and Cline, `references/` from the [Agent Skills](https://agentskills.io/specification) spec.

Each file owns exactly one concern: `memory/state.md` is what exists now, `memory/pipeline.md` is how data and work flow through it, `references/overview.md` is why the project exists, `references/assumptions.md` is what is being taken as true but unverified, and `rules/style.md` holds tooling and collaboration preferences. `references/bugs.md` tracks active defects that can be fixed within the current foundational technology. `references/known-issues.md` is an architectural reality check for problems that can only be resolved by replacing or re-architecting foundational technology; it must explain both the limitation and a credible path to fixing it.

If the pointer file already exists and you have customised it, agent-sesh preserves it as a backup (e.g. `OLD_AGENTS_1.md` or `OLD_CLAUDE_1.md`) in `.agents/handoff/old_agent_files/` before generating the standard template pointer. Untouched template content is discarded rather than backed up, so the backup folder only appears when there is something real to keep.

### 🔗 It shares `.agents/` rather than owning it — and works alongside `npx skills`

`.agents/` is becoming a shared convention — skills, and other tools' files, live
there too. agent-sesh keeps everything of its own inside `.agents/handoff/` and
treats the rest of the folder as none of its business: it never creates, reads as
session state, moves, or archives `.agents/skills/` or anything else beside
`handoff/`. The generated pointer tells agents the same thing.

The [`skills`](https://github.com/vercel-labs/skills) CLI installs reusable
`SKILL.md` instruction sets for the same 78 agents. The two tools are designed
to sit next to each other, in either order:

```bash
npx skills add mattpocock/skills --skill grill-me   # a skill, into .agents/skills/
npx agent-sesh --uni --claude                       # the brain and its pointers
```

What agent-sesh guarantees about skills — every line of this is a test in `test/`:

- **Nothing skills writes is ever touched.** Not the canonical copy in
  `.agents/skills/`, not the per-agent symlinks skills creates (`.claude/skills/…`,
  `.windsurf/skills/…` and the rest of the 54 folders in the registry), not a
  `--copy` install, not `skills-lock.json`. This holds through setup, switching,
  reinitialising and the upgrade migration, and it is enforced at runtime: every
  write agent-sesh makes goes through one guard that refuses any path outside
  `.agents/handoff/`, the pointer files and the git hooks folder.
- **It sees what is installed.** The Workspace note lists the skills found (and
  flags a dangling symlink), the Summary reports them preserved, and the handoff
  README and the pointer tell the agent that `.agents/skills/` holds on-demand
  instructions rather than session state.
- **It knows the same agents.** The registry inside agent-sesh mirrors skills'
  agent table — ids, names, skills folders, install markers — and
  `npm run check:registry` diffs it against upstream so drift is a one-command
  find. Detection uses the same markers, so both tools agree about which agents
  are on your machine.
- **It never writes a `SKILL.md`**, so skills' own discovery can never mistake
  the handoff folder for a skill.

agent-sesh does not install, list, update or remove skills, and never will: that
is what `npx skills` is for.

**Upgrading from an earlier version?** The first run after updating moves your
existing flat `.agents/*.md` files into the new folders automatically, renaming
`context.md` to `references/overview.md`, and moves `.agents/old_agent_files/`
to `.agents/handoff/old_agent_files/`. The old `.agents/README.md` is replaced by
the current one, which describes the new layout. Nothing is lost: a copy of the
old layout is written to `.agents/handoff/archive/<timestamp>-pre-handoff-migration/`
first. If a file's new home already exists and is still an untouched template,
your file replaces it; if it holds anything else, your file is left where it is
and reported rather than overwritten. Template files you never edited are
upgraded in place when a newer version changes them; files you have written in
are never touched.

### ⇄ One pointer per agent, switch any time

Each environment is one root file that an agent reads by default:

| Flag | File | Read by |
| --- | --- | --- |
| `--uni` | `AGENTS.md` | the [open standard](https://agents.md) — Codex, Cursor, Copilot, OpenCode, Zed, Amp, Windsurf, Cline and every other agent without a file of its own |
| `--claude` | `CLAUDE.md` | Claude Code |
| `--gemini` | `GEMINI.md` | Gemini CLI |
| `--qwen` | `QWEN.md` | Qwen Code |
| `--iflow` | `IFLOW.md` | iFlow CLI |

A project can carry several at once — `npx agent-sesh --uni --claude` writes both,
and the interactive checklist starts with Universal ticked and names the agents
found on your machine next to their environment. Every
pointer you keep is protected; every one you untick is retired. The rules never
lose your writing:

- A pointer you have **customised** (it still points at `.agents/handoff/`) is kept as it is, and becomes the source for any pointer you add: the new file is a mirror of it, with references rewritten so it talks about itself rather than the one it came from.
- A pointer that is an **unmodified template** is simply removed when retired, and refreshed in place when a newer version changes the template.
- A pointer that **predates agent-sesh** — a hand-written `AGENTS.md` that never mentions the brain — is backed up to `.agents/handoff/old_agent_files/` and replaced. The summary names the backup, so you can fold what matters into `.agents/handoff/`.

Retiring a customised pointer whose content differs from the one you keep is reported, and its bytes are in the backup folder. Running the same command twice changes nothing. If a pointer file can't be read at all, agent-sesh stops with an error instead of guessing.

---

## 🔒 Pointer File Protection

### How it works (read-only, not immutable)

Unlike older versions that used OS-level immutability (`chattr +i`, `chflags`), agent-sesh now uses **standard read-only permissions** (`chmod 444` on macOS/Linux, `attrib +r` on Windows). This blocks AI agents from writing to the file, but still lets Git delete and replace it during pulls, merges, and checkouts — so your teammates never hit `Permission denied` errors.

### Automatic Git hooks

When you run `agent-sesh` in a Git repository, it automatically installs two local hooks:

- `post-merge` — re-applies read-only protection after `git pull` / `git merge`
- `post-checkout` — re-applies read-only protection after `git checkout`

This means even after your teammates pull your branch and Git replaces the pointer file, the hooks lock it back down immediately. No extra steps required.

**Your existing hooks are safe.** agent-sesh never overwrites a hook it doesn't own. If you already have a `post-merge` or `post-checkout` hook — from Git LFS, Husky, or your own scripts — its protection block is *appended* between clearly marked delimiters:

```sh
# >>> agent-sesh >>>
...
# <<< agent-sesh <<<
```

Re-running only refreshes that block, so hooks stay idempotent no matter how many times you run it. If the existing hook isn't a shell script, agent-sesh leaves it completely alone and prints the block for you to add by hand.

It also finds the right hooks directory rather than assuming `.git/hooks`:

- **`core.hooksPath`** (Husky v5+, Lefthook, monorepos) is respected — hooks go where Git will actually run them.
- **Worktrees and submodules**, where `.git` is a file rather than a folder, resolve to the shared hooks directory.
- **Running from a subdirectory** installs into the repository root's hooks, with the pointer path scoped to your subdirectory. agent-sesh will never create a nested repository inside an existing one.

> **Note:** If you run `agent-sesh` outside any Git repository, it offers to run `git init` for you so the hooks can be installed. If you decline — or if you used flags, which never prompt — it tells you the hooks were skipped and why. Just run `git init` and then `npx agent-sesh` again; it's safe to re-run.

---

## Session Lifecycle

Every AI session follows the following lifecycle:

### 1. Bootstrap
Generate or switch the Project Brain with `npx agent-sesh`.

### 2. Hydrate
Tag the pointer in the AI chat input box — `@AGENTS.md [prompt...]`, or `@CLAUDE.md` in Claude Code, `@GEMINI.md` in Gemini CLI, and so on. For a deeper context load, tag `@.agents/handoff/` or `@.agents/handoff/README.md`.

### 3. Execute
Implement features, refactor, design, and document decisions.

### 4. Snapshot (manual snapshot, if needed)
If the AI does not automatically update the `.agents/handoff/` directory at the end of the session, explicitly instruct it to synchronise the project state by updating the relevant files:
```txt
Update the `.agents/handoff/` directory to reflect the current project state so another AI session can resume without additional context. Ensure that especially the following files are accurately updated:
- memory/state.md (current implementation status)
- memory/tasks.md (next actionable steps)
- memory/last-session.md (clear session handoff summary)
```

The next session resumes from a verified, documented state.

---

## Supported agents

Every agent the [`skills`](https://github.com/vercel-labs/skills#supported-agents)
CLI supports, grouped by the root file it reads by default. The right-hand column
is where `npx skills add` installs for that agent — agent-sesh never writes there.
`npx agent-sesh --agents` prints the same list and marks the agents detected on
your machine.

#### `AGENTS.md` — Universal (`--uni`) · 74 agents

The [open standard](https://agents.md), and the right pointer for every agent
without a file of its own.

| Agent | Skills folder | Agent | Skills folder |
| --- | --- | --- | --- |
| AdaL | `.adal/skills/` | Kimi Code CLI | `.agents/skills/` |
| AiderDesk | `.aider-desk/skills/` | Kiro CLI | `.kiro/skills/` |
| Amp | `.agents/skills/` | Kode | `.kode/skills/` |
| Antigravity | `.agents/skills/` | Lingma | `.lingma/skills/` |
| Antigravity CLI | `.agents/skills/` | Loaf | `.agents/skills/` |
| AstrBot | `data/skills/` | MCPJam | `.mcpjam/skills/` |
| Augment | `.augment/skills/` | MiniMax Code | `.minimax/skills/` |
| Autohand Code CLI | `.autohand/skills/` | Mistral Vibe | `.vibe/skills/` |
| Cline | `.agents/skills/` | Moxby | `.moxby/skills/` |
| Code Studio | `.codestudio/skills/` | Mux | `.mux/skills/` |
| CodeArts Agent | `.codeartsdoer/skills/` | Neovate | `.neovate/skills/` |
| CodeBuddy | `.codebuddy/skills/` | Ona | `.ona/skills/` |
| Codemaker | `.codemaker/skills/` | OpenClaw | `skills/` |
| Codex | `.agents/skills/` | OpenCode | `.agents/skills/` |
| Command Code | `.commandcode/skills/` | OpenHands | `.openhands/skills/` |
| Continue | `.continue/skills/` | Pi | `.agents/skills/` |
| Cortex Code | `.cortex/skills/` | Pochi | `.pochi/skills/` |
| Crush | `.crush/skills/` | Posit Assistant | `.posit/assistant/skills/` |
| Cursor | `.agents/skills/` | PromptScript | `.agents/skills/` |
| Deep Agents | `.agents/skills/` | Qoder | `.qoder/skills/` |
| Devin for Terminal | `.devin/skills/` | Qoder CN | `.qoder/skills/` |
| Dexto | `.agents/skills/` | Reasonix | `.reasonix/skills/` |
| Droid | `.agents/skills/` | Replit | `.agents/skills/` |
| Eve | `agent/skills/` | Roo Code | `.roo/skills/` |
| Firebender | `.agents/skills/` | Rovo Dev | `.rovodev/skills/` |
| ForgeCode | `.forge/skills/` | Sarvam Code | `.agents/skills/` |
| fx | `.fx/skills/` | Tabnine CLI | `.tabnine/agent/skills/` |
| GitHub Copilot | `.agents/skills/` | Terramind | `.terramind/skills/` |
| Goose | `.goose/skills/` | Tinycloud | `.tinycloud/skills/` |
| Grok Build | `.grok/skills/` | Trae | `.trae/skills/` |
| Hermes Agent | `.hermes/skills/` | Trae CN | `.trae/skills/` |
| IBM Bob | `.bob/skills/` | Warp | `.agents/skills/` |
| inference.sh | `.inferencesh/skills/` | Windsurf | `.windsurf/skills/` |
| Jazz | `.jazz/skills/` | ZCode | `.zcode/skills/` |
| Junie | `.junie/skills/` | Zed | `.agents/skills/` |
| Kilo Code | `.agents/skills/` | Zencoder | `.zencoder/skills/` |
| Kimchi | `.kimchi/skills/` | Zenflow | `.zencoder/skills/` |

#### Agents with a root file of their own

| Flag | File | Agent | Skills folder |
| --- | --- | --- | --- |
| `--claude` | `CLAUDE.md` | Claude Code | `.claude/skills/` |
| `--gemini` | `GEMINI.md` | Gemini CLI | `.agents/skills/` |
| `--qwen` | `QWEN.md` | Qwen Code | `.qwen/skills/` |
| `--iflow` | `IFLOW.md` | iFlow CLI | `.iflow/skills/` |

Per-agent *rules folders* (`.cursor/rules/`, `.windsurf/rules/`, `.clinerules`,
`.github/copilot-instructions.md`, `.kiro/steering/` …) are deliberately out of
scope: every one of those agents also reads `AGENTS.md`, and agent-sesh writes
root pointer files only, never into another tool's folder.

---

## Development

Requires Node 20.19+ or 22.12+ (`@clack/prompts` and `@clack/core` are ESM-only
and are loaded with `require`). No build step, no dev dependencies.

```bash
npm test                  # the whole suite — node:test, no dependencies
npm run check:registry    # diff the agent registry against vercel-labs/skills main
```

The suite runs the real CLI in throwaway projects under a fake `HOME`. Interactive
flows are driven through a real pseudo-terminal by `test/drive-pty.py`, which
needs `python3` with the `pty` module — present on Linux and macOS, so those
tests skip, with a message, on Windows. `AGENT_SESH_MATRIX=full npm test` runs
the complete brute-force grid of starting states × actions instead of the
default reduced one.

CI runs the suite on Linux, macOS 26 (Apple Silicon), macOS 15 (Intel) and
Windows Server 2025, on Node 20 and 22, plus the registry drift check. The
Windows checkout is CRLF on purpose: a pointer file that git converted to CRLF
is still recognised as the template and left alone.

Windows notes: pointer protection is the read-only attribute (`chmod 0o444`
sets it; `attrib +R` is applied best-effort). Per-agent skill folders are
junctions there, which is what `npx skills` creates, and the suite mirrors that.
Agent detection resolves `config/`-style markers under `~/.config` on every
platform, the same as `npx skills`.

To run the suite inside a local Windows or macOS VM from a Linux host, see the
`vm` helper in `/mnt/data/not_synced/vms/README.md` on this machine:
`vm win test .` / `vm mac test .`.

---

## 🗎 License

MIT
