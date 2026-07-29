# 🧠 agent-sesh

> **Never start an AI coding session from scratch again.** `agent-sesh` generates a persistent "Project Brain" in your workspace. It solves the "Context Amnesia" problem by creating a standardised `.agents/` directory and a root `AGENTS.md` or `CLAUDE.md` pointer that tells AIs to read and maintain that context.
> Stateful AI coding sessions. Zero amnesia. Maximum vibe.

[![npm version](https://img.shields.io/npm/v/agent-sesh.svg)](https://www.npmjs.com/package/agent-sesh)
[![npm downloads](https://img.shields.io/npm/dm/agent-sesh.svg)](https://www.npmjs.com/package/agent-sesh)
[![npm license](https://img.shields.io/npm/l/agent-sesh.svg)](https://www.npmjs.com/package/agent-sesh)

---

## 🚀 Quick Start
```bash
# Interactive setup & environment selector (Universal vs Claude Code)
npx agent-sesh@latest

# Or directly setup/switch to your preferred environment:
npx agent-sesh --uni      # Universal / Standard (Cursor, Codex, Windsurf)
npx agent-sesh --claude   # Claude Code

npx agent-sesh --version  # Print the version
npx agent-sesh --help     # Show all options
```

The interactive run shows you the version it's using, what already exists in the
project, and what it changed:

```txt
┌  🧠 agent-sesh  v1.0.9
│
◇  Workspace ──────────────────────────────╮
│                                          │
│  Project    my-app                       │
│  Location   ~/code/my-app                │
│  Brain      not set up yet               │
│  Pointer    none                         │
│  Git        repository detected          │
│                                          │
├──────────────────────────────────────────╯
│
◆  Which environment do you want to set up?
│  ● 🟢 Universal — AGENTS.md (Codex, Cursor, Windsurf, Copilot…)
│  ○ 🟠 Claude Code — CLAUDE.md
│
◇  Project brain ready in .agents/
│
◇  Summary ────────────────────────────────╮
│                                          │
│  .agents/     14 files created           │
│  AGENTS.md    created                    │
│  protection   read-only                  │
│  git hooks    post-merge, post-checkout  │
│                                          │
├──────────────────────────────────────────╯
│
◇  Next steps ───────────────────────────────────────────────╮
│                                                            │
│  1  Start your AI session with @AGENTS.md                  │
│  2  Fill in .agents/context.md and .agents/state.md        │
│  3  Ask the AI to update .agents/ before the session ends  │
│                                                            │
├────────────────────────────────────────────────────────────╯
│
└  Done — AGENTS.md now points agents at .agents/
```

Re-running is always safe. When a project is already set up, the first question
becomes *switch environment* or *reinitialise*, and the currently active
environment is marked `current` and pre-selected.

Colour is disabled automatically when output is piped, and honours
[`NO_COLOR`](https://no-color.org). With `--uni` / `--claude`, or in CI and other
non-interactive terminals, the same information prints as plain text.

---

## 🧠 Why?

AI forgets everything between chats.
Architecture, tasks, decisions — gone.

agent-sesh generates an open-source standardised `.agents/` **Project Brain** in your repo so every session starts with full context. It also creates a root-level pointer file (`AGENTS.md` or `CLAUDE.md`) that tells AI agents to read `.agents/` before doing work.

---

## 📦 What It Creates
```txt
project/
├── AGENTS.md
└── .agents/
    ├── README.md
    ├── state.md
    ├── pipeline.md
    ├── tasks.md
    ├── last-session.md
    ├── decisions.md
    ├── commands.md
    ├── context.md
    ├── assumptions.md
    ├── style.md
    ├── roadmap.md
    ├── constraints.md
    ├── known-issues.md
    └── glossary.md
```
The package does not ship a prebuilt `.agents/` folder. These files are generated on the client's computer when `npx agent-sesh` runs.

The default structure is intentionally compact so agents actually keep it updated. Each file owns exactly one concern: `state.md` is what exists now, `pipeline.md` is how data and work flow through it, `context.md` is why the project exists, `assumptions.md` is what is being taken as true but unverified, and `style.md` holds tooling and collaboration preferences.

The instruction pointer file forces the AI to:
1. Read `.agents/README.md` and every file in `.agents/` at session start
2. Treat the pointer file as a pointer only, not as project memory
3. Update the relevant `.agents/` files before session end

If the pointer file already exists and you have customised it, agent-sesh preserves it as a backup (e.g. `OLD_AGENTS_1.md` or `OLD_CLAUDE_1.md`) in `.agents/old_agent_files/` before generating the standard template pointer. Untouched template content is discarded rather than backed up, so the backup folder only appears when there is something real to keep.

### 🔄 Seamless Environment Switching

You can switch your workspace environment at any time:
- Switching to **Universal** (`--uni`) mirrors the contents of `CLAUDE.md` into `AGENTS.md`, protects `AGENTS.md`, and clears up `CLAUDE.md`.
- Switching to **Claude Code** (`--claude`) mirrors the contents of `AGENTS.md` into `CLAUDE.md`, protects `CLAUDE.md`, and clears up `AGENTS.md`.

This carries over any custom instructions you've tailored for your agents, rewriting references so the new file talks about itself rather than the one it came from.

**If both `AGENTS.md` and `CLAUDE.md` exist with different custom content**, nothing is overwritten. The file you are switching *to* is kept exactly as it is, and the other one is backed up to `.agents/old_agent_files/`. agent-sesh never deletes or overwrites hand-written pointer content — and if a pointer file can't be read at all, it stops with an error instead of guessing.

---

## 🔒 Pointer File Protection

The instruction file (`AGENTS.md` or `CLAUDE.md`) is meant to be a stable pointer, not a working memory file.

agent-sesh protects it so AI agents are less likely to accidentally overwrite it. All project state, tasks, decisions, issues, and handoff notes should live in `.agents/`.

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

> **Note:** If you run `agent-sesh` outside any Git repository, it offers to run `git init` for you so the hooks can be installed. If you decline — or if you used `--uni` / `--claude`, which never prompt — it tells you the hooks were skipped and why. Just run `git init` and then `npx agent-sesh` again; it's safe to re-run.

### tl;dr

| | Old (`chattr +i`) | New (`chmod 444`) |
|---|---|---|
| AI writes blocked? | Yes | Yes |
| `git pull` works? | No — crashes | Yes |
| Teammates need to do anything? | Couldn't pull at all | Hooks auto-protect |
| `rm -f` works? | No | Yes |

---

## 🏗 Session Lifecycle

Every AI session follows the following lifecycle:

### 1️⃣ Bootstrap
Generate or switch the Project Brain:
```bash
npx agent-sesh
```
### 2️⃣ Hydrate
Force the model to ingest full project context:  
In the AI chat input box:
```txt
@AGENTS.md [prompt...]  # Or @CLAUDE.md for Claude Code
```
For a deeper context load, tag `@.agents/` or `@.agents/README.md`.
### 3️⃣ Execute
Implement features, refactor, design, and document decisions.

### 4️⃣ Snapshot (manual snapshot, if needed)
If the AI does not automatically update the `.agents/` directory at the end of the session, explicitly instruct it to synchronise the project state by updating the relevant files:
```txt
Update the `.agents/` directory to reflect the current project state so another AI session can resume without additional context. Ensure that especially the following files are accurately updated:
- state.md (current implementation status)
- tasks.md (next actionable steps)
- last-session.md (clear session handoff summary)
```

The next session resumes from a verified, documented state.

---

## 🔄 AI-to-AI Handoffs

Claude → ChatGPT  
ChatGPT → Open Weights Models  
Today → Tomorrow  

The model changes.
The brain persists.

---

## 🪪 License

MIT

---

Stop losing context.
Start building with memory. ⚡
