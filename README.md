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
npx agent-sesh

# Or directly setup/switch to your preferred environment:
npx agent-sesh --uni      # Universal / Standard (Cursor, Codex, Windsurf)
npx agent-sesh --claude   # Claude Code
```
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
    ├── tasks.md
    ├── last-session.md
    ├── decisions.md
    ├── commands.md
    ├── context.md
    ├── style.md
    ├── roadmap.md
    ├── constraints.md
    ├── known-issues.md
    └── glossary.md
```
The package does not ship a prebuilt `.agents/` folder. These files are generated on the client's computer when `npx agent-sesh` runs.

The default structure is intentionally compact so agents actually keep it updated. Pipeline details live in `state.md`, assumptions live in `context.md`, and tooling or collaboration preferences live in `style.md`.

The instruction pointer file forces the AI to:
1. Read `.agents/README.md` and every file in `.agents/` at session start
2. Treat the pointer file as a pointer only, not as project memory
3. Update the relevant `.agents/` files before session end

If the pointer file already exists, agent-sesh preserves it as a backup (e.g. `OLD_AGENTS_1.md` or `OLD_CLAUDE_1.md`) before generating the standard template pointer.

### 🔄 Seamless Environment Switching

You can easily switch your workspace environment at any time:
- Switching to **Universal** (`--uni`) will copy/mirror the contents of `CLAUDE.md` to `AGENTS.md`, protect `AGENTS.md`, and clean up `CLAUDE.md`.
- Switching to **Claude Code** (`--claude`) will copy/mirror the contents of `AGENTS.md` to `CLAUDE.md`, protect `CLAUDE.md`, and clean up `AGENTS.md`.

This copies over any custom instructions you've tailored for your agents, while keeping your workspace clean and target-specific.

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

> **Note:** If you run `agent-sesh` before `git init`, it will offer to run `git init` for you so the hooks can be installed. If you decline, just run `git init` and then `npx agent-sesh` again — it's safe to re-run.

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
