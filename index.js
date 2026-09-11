#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const {
  intro,
  outro,
  select,
  multiselect,
  confirm,
  note,
  log,
  spinner,
  cancel,
  isCancel,
  isTTY,
} = require("@clack/prompts");

// Canonical, so paths agree with what git reports: macOS resolves /var to
// /private/var, and Windows can hand out 8.3 short names or a lowercase
// drive letter for the same folder.
function canonicalPath(candidate) {
  try {
    return fs.realpathSync.native(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

const projectRoot = canonicalPath(process.cwd());

// `.agents/` is a shared namespace: skills/ and other tools' folders live
// beside us. Everything agent-sesh owns is confined to `.agents/handoff/`, and
// every path it creates, reads, moves or archives is built from handoffPath()
// or handoffTarget — so nothing outside that subtree is ever in reach.
const agentsDirName = ".agents";
const handoffDirName = "handoff";
const memoryDirName = "memory";
const rulesDirName = "rules";
const referencesDirName = "references";
const archiveDirName = "archive";
const backupDirName = "old_agent_files";
const skillsDirName = "skills";

const target = path.join(projectRoot, agentsDirName);
const handoffTarget = path.join(target, handoffDirName);

// ".agents/handoff" — the single label every user-facing string derives from,
// so renaming the subtree never leaves a stale literal behind in the UI.
const handoffLabel = `${agentsDirName}/${handoffDirName}`;

const handoffPath = (relativePath) =>
  path.join(handoffTarget, ...relativePath.split("/"));

// Names the folder a handoff-relative file sits in, the way a person would.
// `path.dirname("README.md")` is ".", which would surface in an error message
// as ".agents/handoff/./".
const handoffFolderLabel = (relativePath) => {
  const parent = relativePath.split("/").slice(0, -1).join("/");
  return parent ? `${handoffLabel}/${parent}/` : `${handoffLabel}/`;
};

// ── agent ecosystem registry ──────────────────────────────────────
//
// Mirrors the agent table in vercel-labs/skills (src/agents.ts, v1.5.23): the
// same 77 agents, the same project skills folders, the same install markers.
// `npm run check:registry` diffs this list against upstream main.
//
//   skillsDir  the folder `npx skills` installs into for that agent. agent-sesh
//              never writes there; it only looks there to report what is installed.
//   detect     what skills checks to decide the agent is present on this machine.
//              "~/x" is under the home directory, "./x" under the project,
//              "config/x" under $XDG_CONFIG_HOME (default ~/.config), "$VAR|~/x"
//              honours an override variable first, "pkg:x" is a package.json
//              dependency. Any one match counts.
//   pointer    which root instruction file the agent reads. Absent means
//              AGENTS.md, the open standard — see pointerEnvironments below.
const agentRegistry = [
  { id: "aider-desk", name: "AiderDesk", skillsDir: ".aider-desk/skills", detect: ["~/.aider-desk"] },
  { id: "amp", name: "Amp", skillsDir: ".agents/skills", detect: ["config/amp"] },
  { id: "antigravity", name: "Antigravity", skillsDir: ".agents/skills", detect: ["~/.gemini/antigravity"] },
  { id: "antigravity-cli", name: "Antigravity CLI", skillsDir: ".agents/skills", detect: ["~/.gemini/antigravity-cli"] },
  { id: "astrbot", name: "AstrBot", skillsDir: "data/skills", detect: ["./data/skills", "~/.astrbot"] },
  { id: "autohand-code", name: "Autohand Code CLI", skillsDir: ".autohand/skills", detect: ["$AUTOHAND_HOME|~/.autohand"] },
  { id: "augment", name: "Augment", skillsDir: ".augment/skills", detect: ["~/.augment"] },
  { id: "bob", name: "IBM Bob", skillsDir: ".bob/skills", detect: ["~/.bob"] },
  { id: "claude-code", name: "Claude Code", skillsDir: ".claude/skills", detect: ["$CLAUDE_CONFIG_DIR|~/.claude"], pointer: "claude" },
  { id: "openclaw", name: "OpenClaw", skillsDir: "skills", detect: ["~/.openclaw", "~/.clawdbot", "~/.moltbot"] },
  { id: "cline", name: "Cline", skillsDir: ".agents/skills", detect: ["~/.cline"] },
  { id: "codearts-agent", name: "CodeArts Agent", skillsDir: ".codeartsdoer/skills", detect: ["~/.codeartsdoer"] },
  { id: "codebuddy", name: "CodeBuddy", skillsDir: ".codebuddy/skills", detect: ["./.codebuddy", "~/.codebuddy"] },
  { id: "codemaker", name: "Codemaker", skillsDir: ".codemaker/skills", detect: ["~/.codemaker"] },
  { id: "codestudio", name: "Code Studio", skillsDir: ".codestudio/skills", detect: ["~/.codestudio"] },
  { id: "codex", name: "Codex", skillsDir: ".agents/skills", detect: ["$CODEX_HOME|~/.codex", "/etc/codex"] },
  { id: "command-code", name: "Command Code", skillsDir: ".commandcode/skills", detect: ["~/.commandcode"] },
  { id: "continue", name: "Continue", skillsDir: ".continue/skills", detect: ["./.continue", "~/.continue"] },
  { id: "cortex", name: "Cortex Code", skillsDir: ".cortex/skills", detect: ["~/.snowflake/cortex"] },
  { id: "crush", name: "Crush", skillsDir: ".crush/skills", detect: ["~/.config/crush"] },
  { id: "cursor", name: "Cursor", skillsDir: ".agents/skills", detect: ["~/.cursor"] },
  { id: "deepagents", name: "Deep Agents", skillsDir: ".agents/skills", detect: ["~/.deepagents"] },
  { id: "devin", name: "Devin for Terminal", skillsDir: ".devin/skills", detect: ["config/devin"] },
  { id: "dexto", name: "Dexto", skillsDir: ".agents/skills", detect: ["~/.dexto"] },
  { id: "droid", name: "Droid", skillsDir: ".factory/skills", detect: ["~/.factory"] },
  { id: "eve", name: "Eve", skillsDir: "agent/skills", detect: ["pkg:eve"] },
  { id: "firebender", name: "Firebender", skillsDir: ".agents/skills", detect: ["~/.firebender"] },
  { id: "forgecode", name: "ForgeCode", skillsDir: ".forge/skills", detect: ["~/.forge"] },
  { id: "gemini-cli", name: "Gemini CLI", skillsDir: ".agents/skills", detect: ["~/.gemini"], pointer: "gemini" },
  { id: "github-copilot", name: "GitHub Copilot", skillsDir: ".agents/skills", detect: ["~/.copilot"] },
  { id: "goose", name: "Goose", skillsDir: ".goose/skills", detect: ["config/goose"] },
  { id: "grok", name: "Grok Build", skillsDir: ".grok/skills", detect: ["$GROK_HOME|~/.grok"] },
  { id: "hermes-agent", name: "Hermes Agent", skillsDir: ".hermes/skills", detect: ["$HERMES_HOME|~/.hermes"] },
  { id: "inference-sh", name: "inference.sh", skillsDir: ".inferencesh/skills", detect: ["~/.inferencesh"] },
  { id: "jazz", name: "Jazz", skillsDir: ".jazz/skills", detect: ["~/.jazz", "./.jazz"] },
  { id: "junie", name: "Junie", skillsDir: ".junie/skills", detect: ["~/.junie"] },
  { id: "iflow-cli", name: "iFlow CLI", skillsDir: ".iflow/skills", detect: ["~/.iflow"], pointer: "iflow" },
  { id: "kilo", name: "Kilo Code", skillsDir: ".kilocode/skills", detect: ["~/.kilocode"] },
  { id: "kimchi", name: "Kimchi", skillsDir: ".kimchi/skills", detect: ["~/.config/kimchi"] },
  { id: "kimi-code-cli", name: "Kimi Code CLI", skillsDir: ".agents/skills", detect: ["~/.kimi-code", "~/.kimi"] },
  { id: "kiro-cli", name: "Kiro CLI", skillsDir: ".kiro/skills", detect: ["~/.kiro"] },
  { id: "kode", name: "Kode", skillsDir: ".kode/skills", detect: ["~/.kode"] },
  { id: "lingma", name: "Lingma", skillsDir: ".lingma/skills", detect: ["~/.lingma"] },
  { id: "loaf", name: "Loaf", skillsDir: ".agents/skills", detect: ["~/.loaf"] },
  { id: "mcpjam", name: "MCPJam", skillsDir: ".mcpjam/skills", detect: ["~/.mcpjam"] },
  { id: "minimax-code", name: "MiniMax Code", skillsDir: ".minimax/skills", detect: ["~/.minimax", "/Applications/MiniMax Code.app"] },
  { id: "mistral-vibe", name: "Mistral Vibe", skillsDir: ".vibe/skills", detect: ["$VIBE_HOME|~/.vibe"] },
  { id: "moxby", name: "Moxby", skillsDir: ".moxby/skills", detect: ["~/.moxby"] },
  { id: "mux", name: "Mux", skillsDir: ".mux/skills", detect: ["~/.mux"] },
  { id: "opencode", name: "OpenCode", skillsDir: ".agents/skills", detect: ["config/opencode"] },
  { id: "openhands", name: "OpenHands", skillsDir: ".openhands/skills", detect: ["~/.openhands"] },
  { id: "ona", name: "Ona", skillsDir: ".ona/skills", detect: ["~/.ona"] },
  { id: "pi", name: "Pi", skillsDir: ".pi/skills", detect: ["~/.pi/agent"] },
  { id: "posit-assistant", name: "Posit Assistant", skillsDir: ".posit/assistant/skills", detect: ["~/.posit/assistant", "~/.positai"] },
  { id: "qoder", name: "Qoder", skillsDir: ".qoder/skills", detect: ["~/.qoder"] },
  { id: "qoder-cn", name: "Qoder CN", skillsDir: ".qoder/skills", detect: ["~/.qoder-cn"] },
  { id: "qwen-code", name: "Qwen Code", skillsDir: ".qwen/skills", detect: ["~/.qwen"], pointer: "qwen" },
  { id: "replit", name: "Replit", skillsDir: ".agents/skills", detect: ["./.replit"] },
  { id: "reasonix", name: "Reasonix", skillsDir: ".reasonix/skills", detect: ["~/.reasonix"] },
  { id: "rovodev", name: "Rovo Dev", skillsDir: ".rovodev/skills", detect: ["~/.rovodev"] },
  { id: "roo", name: "Roo Code", skillsDir: ".roo/skills", detect: ["~/.roo"] },
  { id: "tabnine-cli", name: "Tabnine CLI", skillsDir: ".tabnine/agent/skills", detect: ["~/.tabnine"] },
  { id: "terramind", name: "Terramind", skillsDir: ".terramind/skills", detect: ["~/.terramind"] },
  { id: "tinycloud", name: "Tinycloud", skillsDir: ".tinycloud/skills", detect: ["~/.tinycloud"] },
  { id: "trae", name: "Trae", skillsDir: ".trae/skills", detect: ["~/.trae"] },
  { id: "trae-cn", name: "Trae CN", skillsDir: ".trae/skills", detect: ["~/.trae-cn"] },
  { id: "warp", name: "Warp", skillsDir: ".agents/skills", detect: ["~/.warp"] },
  { id: "windsurf", name: "Windsurf", skillsDir: ".windsurf/skills", detect: ["~/.codeium/windsurf"] },
  { id: "zed", name: "Zed", skillsDir: ".agents/skills", detect: ["config/zed", "$APPDATA/Zed", "$FLATPAK_XDG_CONFIG_HOME/zed"] },
  { id: "zcode", name: "ZCode", skillsDir: ".zcode/skills", detect: ["~/.zcode", "/Applications/ZCode.app"] },
  { id: "zencoder", name: "Zencoder", skillsDir: ".zencoder/skills", detect: ["~/.zencoder"] },
  { id: "zenflow", name: "Zenflow", skillsDir: ".zencoder/skills", detect: ["~/.zencoder"] },
  { id: "neovate", name: "Neovate", skillsDir: ".neovate/skills", detect: ["~/.neovate"] },
  { id: "pochi", name: "Pochi", skillsDir: ".pochi/skills", detect: ["~/.pochi"] },
  { id: "promptscript", name: "PromptScript", skillsDir: ".agents/skills", detect: ["./.promptscript", "./promptscript.yaml"] },
  { id: "adal", name: "AdaL", skillsDir: ".adal/skills", detect: ["~/.adal"] },
  // skills' own placeholder for "every agent that reads .agents/skills/". Kept
  // so the registry diff is exact; never shown as an agent.
  { id: "universal", name: "Universal", skillsDir: ".agents/skills", detect: [], hidden: true },
];

// The canonical location `npx skills` installs into. Every agent whose
// skillsDir is this folder reads it directly; the rest get a symlink into
// their own folder that points back here.
const canonicalSkillsDir = `${agentsDirName}/${skillsDirName}`;
const skillsLockFileName = "skills-lock.json";

// ── pointer environments ──────────────────────────────────────────
//
// One entry per *root instruction file* an agent reads by default. Only agents
// whose default file is not AGENTS.md get their own entry; AGENTS.md is the
// open standard (https://agents.md) and the right pointer for everything else.
// A project may carry several of these at once — one per agent in use.
//
// Everything that names a pointer file — flags, prompts, backups, hooks, the
// template check — derives from this table, so adding an environment is one
// line here.
const pointerEnvironments = [
  {
    id: "universal",
    flag: "--uni",
    fileName: "AGENTS.md",
    label: "Universal",
    icon: "\u{1F7E2}",
    summary: "the open standard — Codex, Cursor, Copilot…",
  },
  {
    id: "claude",
    flag: "--claude",
    fileName: "CLAUDE.md",
    label: "Claude Code",
    icon: "\u{1F7E0}",
    summary: "Anthropic Claude Code",
  },
  {
    id: "gemini",
    flag: "--gemini",
    fileName: "GEMINI.md",
    label: "Gemini CLI",
    icon: "\u{1F535}",
    summary: "Google Gemini CLI (its default context file)",
  },
  {
    id: "qwen",
    flag: "--qwen",
    fileName: "QWEN.md",
    label: "Qwen Code",
    icon: "\u{1F7E3}",
    summary: "Qwen Code (its default context file)",
  },
  {
    id: "iflow",
    flag: "--iflow",
    fileName: "IFLOW.md",
    label: "iFlow CLI",
    icon: "⚪",
    summary: "iFlow CLI (its default context file)",
  },
];

const defaultEnvironment = pointerEnvironments[0];
const pointerFileNames = pointerEnvironments.map((env) => env.fileName);

const pointerPath = (env) => path.join(projectRoot, env.fileName);
const environmentById = (id) => pointerEnvironments.find((env) => env.id === id) || null;
const environmentByFlag = (flag) => pointerEnvironments.find((env) => env.flag === flag) || null;
const agentPointerId = (agent) => agent.pointer || defaultEnvironment.id;

// Registry agents that read a given environment's pointer file.
function agentsForEnvironment(env) {
  return agentRegistry.filter((agent) => !agent.hidden && agentPointerId(agent) === env.id);
}

// Environments whose pointer file exists here right now, in table order.
function presentEnvironments() {
  return pointerEnvironments.filter((env) => isRegularFile(pointerPath(env)));
}

// "A, B, C +2 more" — the same shape skills uses, so the two tools read alike.
function describeList(items, maxShown = 4) {
  if (items.length <= maxShown) return items.join(", ");
  return `${items.slice(0, maxShown).join(", ")} +${items.length - maxShown} more`;
}

function joinNames(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const agentFiles = {
  "README.md": `# ${handoffLabel}

This folder is the project brain for AI agents working in this repository.

## Required Agent Workflow

1. Read this file first.
2. Read every other file in this folder before changing code.
3. Keep the relevant files updated as work progresses.
4. Before ending a session, update ${memoryDirName}/state.md, ${memoryDirName}/tasks.md,
   and ${memoryDirName}/last-session.md.
5. Do not read ${archiveDirName}/ by default. Open a specific snapshot only when
   the task needs historical context.

## Layout

- ${memoryDirName}/: mutable session state. Expect to rewrite these as work moves.
- ${rulesDirName}/: standing guardrails. Obey these; change them rarely and deliberately.
- ${referencesDirName}/: project background and tracked problems. Consult as needed.

## Files

### ${memoryDirName}/ — session state

- ${memoryDirName}/state.md: current implementation status and system shape.
- ${memoryDirName}/pipeline.md: how work and data flow through the system end to end.
- ${memoryDirName}/tasks.md: next actionable tasks.
- ${memoryDirName}/last-session.md: handoff notes from the most recent session.
- ${memoryDirName}/decisions.md: settled technical decisions and tradeoffs.

### ${rulesDirName}/ — standing guardrails

- ${rulesDirName}/style.md: coding and writing style preferences.
- ${rulesDirName}/constraints.md: hard rules and limits.

### ${referencesDirName}/ — background and tracked problems

- ${referencesDirName}/overview.md: project intent, goals, and non-goals.
- ${referencesDirName}/glossary.md: project-specific terms.
- ${referencesDirName}/roadmap.md: near-future direction.
- ${referencesDirName}/assumptions.md: what is being taken as true, and what still needs verification.
- ${referencesDirName}/bugs.md: active defects that can be fixed within the current foundational technology.
- ${referencesDirName}/known-issues.md: foundational technology limits that require replacement or architectural change to resolve.
- ${referencesDirName}/commands.md: project-specific command reference.

### Not part of default context

- ${archiveDirName}/: historical project-brain snapshots.
- ${backupDirName}/: backups of previous root pointer files.

## Outside This Folder

\`${agentsDirName}/\` is a shared folder. \`${canonicalSkillsDir}/\` holds skills installed
with \`npx skills\` (skills.sh): on-demand instructions you load yourself when a task
matches one. They are not session state. Anything else sitting beside
\`${handoffDirName}/\` belongs to you or to other tools. agent-sesh never creates,
moves, or archives any of it.
`,

  // ── memory/ — mutable session state ─────────────────────────

  "memory/state.md": `# State

Describe how the project works right now. Keep this present-tense and accurate. Include runtime behavior, important components, and data flow here.

## Current State

## Implemented

## Missing Or Partial

## Invariants

<!-- End-to-end flow belongs in pipeline.md, not here. -->
`,
  "memory/pipeline.md": `# Pipeline

Describe how work and data actually move through the system, end to end. Follow one real path rather than listing components.

## Entry Points

## Stages

## Data Flow

## Side Effects

## Failure Modes And Recovery
`,
  "memory/tasks.md": `# Tasks

Track current actionable work. Keep this scoped and ordered.

## Now

## Next

## Done
`,
  "memory/last-session.md": `# Last Session

Write a clear handoff for the next agent.

## Summary

## Changed

## Tried But Did Not Finish

## Next Steps
`,
  "memory/decisions.md": `# Decisions

Record settled decisions and the reasoning behind them.

## Active Decisions

## Rejected Options

## Revisit Later
`,

  // ── rules/ — standing guardrails ────────────────────────────

  "rules/style.md": `# Style

Document coding, naming, file organization, tooling, and communication preferences.

## Code Style

## File Organization

## Naming

## Preferred Tools

## Preferred Patterns

## Communication
`,
  "rules/constraints.md": `# Constraints

Document hard rules, platform limits, security requirements, and other boundaries.

## Hard Rules

## Technical Limits

## Security And Privacy

## Dependencies
`,

  // ── references/ — background and tracked problems ───────────

  "references/overview.md": `# Overview

Explain why this project exists and what it is trying to achieve.

## Goal

## Non-Goals

## Users

## Background

<!-- What you are taking as true belongs in assumptions.md, not here. -->
`,
  "references/glossary.md": `# Glossary

Define project-specific terms and domain language.

## Terms

## Acronyms

## Ambiguous Words
`,
  "references/roadmap.md": `# Roadmap

Describe the near-future direction without turning this into a backlog dump.

## Planned

## Later

## Explicitly Postponed
`,

  "references/assumptions.md": `# Assumptions

Record what this project takes as true but has not proven. An assumption written down can be challenged; an unwritten one silently breaks things.

## Active Assumptions

## Needs Verification

## Invalidated
`,
  "references/bugs.md": `# Bugs

This is the active queue for observed or suspected defects that can be fixed within the project's current foundational technology. These problems require investigation, repair, and verification.

> **Agent rule:** Every current bug is unresolved work. Keep it visible and give it a concrete Next action until a fix is verified. Never close or reclassify a bug merely because it is difficult, low priority, or has a workaround.

## File Boundary

- Foundational technology means the core database, auth provider, framework or runtime, infrastructure platform, protocol, or fundamental algorithmic approach on which the project is built.
- Keep a problem here when it can be fixed through code, configuration, schemas, integrations, or supported upgrades without replacing that foundation.
- Difficulty does not determine the file. An extra-hard defect remains a bug if the current foundation can support a correct implementation.
- Move a problem to known-issues.md only when evidence shows that a correct fix requires replacing or re-architecting foundational technology. Carry over the evidence and identify the required foundational change.
- A workaround reduces impact but does not resolve or close a bug.
- After a fix is verified, move the entry to Fixed Bugs. Do not mark a bug fixed based only on a code change.
- When a bug is part of the current work plan, ${memoryDirName}/tasks.md may reference its bug ID instead of duplicating its details.

## Current Bugs

Difficulty describes the likely scope and uncertainty of the fix, not its severity or priority. Reclassify a bug when new evidence changes the estimate. Within each section, order bugs by severity and then age.

### Needs Triage

Use this section when a report is not yet reproducible or there is not enough evidence to estimate the fix. Record the smallest next investigation step, then move the bug to a difficulty section once its scope is understood.

### Easy Fix

The cause is understood and localized. The fix should be a small change with focused verification.

### Hard Fix

The bug needs substantial investigation or coordinated changes across multiple parts of the system.

### Extra Hard Fix

The root cause is unclear or the repair needs broad, coordinated work, but a correct fix is still possible within the current foundational technology. Record the smallest useful experiment instead of guessing at a solution.

<!--
Current bug entry:

#### BUG-001 — Short title
- Severity: low | medium | high | critical
- Status: reported | reproduced | investigating | fixing | blocked
- Area:
- Reported: YYYY-MM-DD
- Reproduction:
- Expected:
- Actual:
- Evidence:
- Workaround: none
- Next action:
-->

## Fixed Bugs

Keep a concise, verifiable history here. Add newly fixed bugs first.

<!--
Fixed bug entry:

### BUG-001 — Short title
- Fixed: YYYY-MM-DD
- Cause:
- Resolution:
- Verification:
- Reference: commit, PR, or issue
-->
`,
  "references/known-issues.md": `# Known Issues

This is the project's architectural reality check. It documents problems caused by hard capability limits in the current foundational technology when a real fix requires replacing or re-architecting that foundation.

> **Agent rule:** Nothing in this file is accepted as a permanent flaw or excused as "won't fix." Treat every current item as unresolved. Do not disguise the problem with a local patch that cannot satisfy the requirement; state the technological limit honestly and outline the foundational change that can resolve it.

## File Boundary

- Foundational technology means the core database, auth provider, framework or runtime, infrastructure platform, protocol, or fundamental algorithmic approach on which the project is built.
- Add a problem here only when evidence shows the current foundation cannot support a correct solution.
- Cost, difficulty, priority, or lack of developer time are not foundational limitations. If the current stack can solve the problem, it belongs in bugs.md.
- Every entry must explain the blocked requirement, why the current foundation cannot meet it, and what replacement or architectural change would make a real fix possible.
- An interim mitigation may reduce harm, but it is not a fix and must not hide the unresolved limitation.
- When a migration becomes active, link its decision, roadmap, and tasks here. Keep the issue until the foundational change is complete and the original requirement is verified.

## Current Foundational Issues

These are unresolved problems that require a change to the project's foundation.

<!--
Current foundational issue entry:

### FOUNDATION-001 — Short title
- Status: demonstrated | evaluating alternatives | migration planned | migration in progress
- Current foundation:
- Blocked requirement:
- Observed limitation:
- Why the current foundation cannot solve it:
- Evidence:
- Required foundational change:
- Candidate replacement or approach:
- Migration impact:
- Interim mitigation: none
- Next strategic action:
- References: decision, roadmap item, task, research, or upstream documentation
-->

## Resolved Foundational Issues

Move an issue here only after the foundational change is complete and the previously blocked requirement has been verified.

<!--
Resolved foundational issue entry:

### FOUNDATION-001 — Short title
- Resolved: YYYY-MM-DD
- Previous foundation:
- Replacement or architectural change:
- Resolution:
- Verification:
- Reference: commit, PR, decision, or migration record
-->
`,
  "references/commands.md": `# Project Commands

Document the all essential and relevant commands for working on this project. Keep this file updated as the project evolves.

## Frontend

## Backend

<!--
Feel free to add more and custom headings like:
    ## Database
    ## Testing
    ## Build / Deploy
    ## Linting / Formatting
    ## Utility Scripts
    ## Custom Workflows

etc...
-->
`,
};

const agentsFileContent = `# Agent Instructions

This project uses \`${handoffLabel}/\` as its agent memory and handoff folder.

IMPORTANT: Do not edit this AGENTS.md file for project memory, state, tasks, decisions, or handoff notes. This file is only a pointer. Put all project memory updates in \`${handoffLabel}/\`.

Before making changes:
1. Read \`${handoffLabel}/README.md\`.
2. Read every active standard file in \`${handoffLabel}/${memoryDirName}/\`,
   \`${handoffLabel}/${rulesDirName}/\`, and \`${handoffLabel}/${referencesDirName}/\`.
   Do not recursively read \`${handoffLabel}/${archiveDirName}/\`; open a specific
   snapshot only when the task needs historical context.
3. Treat \`${handoffLabel}/${memoryDirName}/state.md\`, \`${handoffLabel}/${memoryDirName}/tasks.md\`, and \`${handoffLabel}/${memoryDirName}/last-session.md\` as the primary session state.
4. Keep the relevant files in \`${handoffLabel}/\` updated before ending the session.

\`${agentsDirName}/\` is a shared folder. \`${canonicalSkillsDir}/\` holds skills installed with \`npx skills\`: on-demand instructions, not session state. Anything else beside \`${handoffDirName}/\` belongs to the user or to other tools. Read it when a task calls for it, but never treat it as session state and never write session state into it.

Do not skip the \`${handoffLabel}/\` files. Do not write session state into AGENTS.md. The \`${handoffLabel}/\` folder is the source of truth for agent context in this project.
`;

// Frozen copies of every pointer body agent-sesh has ever shipped.
//
// isDefaultTemplate() compares byte-for-byte, and that verdict decides whether
// a pointer file is discarded as boilerplate or preserved as the user's own
// writing. Without this list, changing the template above would make every
// previously generated AGENTS.md look hand-written and pile up pointless
// backups in ${backupDirName}/.
//
// NEVER edit an entry here — these are a wire format, not live copy. When the
// template above changes, append its outgoing body as a new entry.
//
// Every entry is compared against every pointer file name, so a body that
// shipped as CLAUDE.md is recognised just as well as one that shipped as
// AGENTS.md.
const legacyPointerTemplates = [
  // The 1.1.0 development builds after the rules/ + references/ rename, before
  // the pointer started naming `npx skills`. Never published; generated locally.
  // Folder names are literals for the same reason as the entry below.
  `# Agent Instructions

This project uses \`${handoffLabel}/\` as its agent memory and handoff folder.

IMPORTANT: Do not edit this AGENTS.md file for project memory, state, tasks, decisions, or handoff notes. This file is only a pointer. Put all project memory updates in \`${handoffLabel}/\`.

Before making changes:
1. Read \`${handoffLabel}/README.md\`.
2. Read every active standard file in \`${handoffLabel}/${memoryDirName}/\`,
   \`${handoffLabel}/rules/\`, and \`${handoffLabel}/references/\`.
   Do not recursively read \`${handoffLabel}/${archiveDirName}/\`; open a specific
   snapshot only when the task needs historical context.
3. Treat \`${handoffLabel}/${memoryDirName}/state.md\`, \`${handoffLabel}/${memoryDirName}/tasks.md\`, and \`${handoffLabel}/${memoryDirName}/last-session.md\` as the primary session state.
4. Keep the relevant files in \`${handoffLabel}/\` updated before ending the session.

\`${agentsDirName}/\` is a shared folder. Anything beside \`${handoffDirName}/\` — including \`${agentsDirName}/skills/\` — belongs to the user or to other tools. Read it when a task calls for it, but never treat it as session state and never write session state into it.

Do not skip the \`${handoffLabel}/\` files. Do not write session state into AGENTS.md. The \`${handoffLabel}/\` folder is the source of truth for agent context in this project.
`,

  // The first 1.1.0 development builds, which used context/ and reference/.
  // Never published, but the linked binary generated these locally.
  // The two renamed folders are literals here on purpose: a frozen entry has to
  // reproduce the bytes that shipped, and those constants no longer exist.
  `# Agent Instructions

This project uses \`${handoffLabel}/\` as its agent memory and handoff folder.

IMPORTANT: Do not edit this AGENTS.md file for project memory, state, tasks, decisions, or handoff notes. This file is only a pointer. Put all project memory updates in \`${handoffLabel}/\`.

Before making changes:
1. Read \`${handoffLabel}/README.md\`.
2. Read every active standard file in \`${handoffLabel}/${memoryDirName}/\`,
   \`${handoffLabel}/context/\`, and \`${handoffLabel}/reference/\`.
   Do not recursively read \`${handoffLabel}/${archiveDirName}/\`; open a specific
   snapshot only when the task needs historical context.
3. Treat \`${handoffLabel}/${memoryDirName}/state.md\`, \`${handoffLabel}/${memoryDirName}/tasks.md\`, and \`${handoffLabel}/${memoryDirName}/last-session.md\` as the primary session state.
4. Keep the relevant files in \`${handoffLabel}/\` updated before ending the session.

\`${agentsDirName}/\` is a shared folder. Anything beside \`${handoffDirName}/\` — including \`${agentsDirName}/${skillsDirName}/\` — belongs to the user or to other tools. Read it when a task calls for it, but never treat it as session state and never write session state into it.

Do not skip the \`${handoffLabel}/\` files. Do not write session state into AGENTS.md. The \`${handoffLabel}/\` folder is the source of truth for agent context in this project.
`,

  // Shipped unchanged in every release up to and including 1.0.10.
  `# Agent Instructions

This project uses \`${agentsDirName}/\` as its agent memory and handoff folder.

IMPORTANT: Do not edit this AGENTS.md file for project memory, state, tasks, decisions, or handoff notes. This file is only a pointer. Put all project memory updates in \`${agentsDirName}/\`.

Before making changes:
1. Read \`${agentsDirName}/README.md\`.
2. Read every file in \`${agentsDirName}/\`.
3. Treat \`${agentsDirName}/state.md\`, \`${agentsDirName}/tasks.md\`, and \`${agentsDirName}/last-session.md\` as the primary session state.
4. Keep the relevant files in \`${agentsDirName}/\` updated before ending the session.

Do not skip the \`${agentsDirName}/\` files. Do not write session state into AGENTS.md. The \`${agentsDirName}/\` folder is the source of truth for agent context in this project.
`,
];

const oldAgentFilesReadme = `# Old Agent Files

This folder contains backups of previous pointer files
(${pointerFileNames.join(", ")}).

Backups are only created when the pointer file contained **custom user content**
(i.e., content that differs from the default agent-sesh template). Default
template content is never backed up.

## Structure

One folder per pointer file, created the first time that file is backed up:

\`\`\`
old_agent_files/
├── README.md          ← this file
├── agents/
│   ├── README.md      ← symlink to ../README.md
│   ├── OLD_AGENTS_1.md
│   └── OLD_AGENTS_2.md
├── claude/
│   ├── README.md      ← symlink to ../README.md
│   └── OLD_CLAUDE_1.md
└── …                  ← ${pointerEnvironments
    .slice(2)
    .map((env) => `${env.fileName.replace(/\.md$/, "").toLowerCase()}/`)
    .join(", ")}
\`\`\`

## Naming Scheme

- Files are named \`OLD_{${pointerFileNames.map((name) => name.replace(/\.md$/, "")).join("|")}}_N.md\`
  where N is a sequential number.
- **Numbering is the order the backups were taken**: \`_1\` is the oldest, and
  the highest number is the most recent. Existing backups are never renumbered.
- Files are **deduplicated by content**: a pointer file whose content already
  matches a stored backup is discarded instead of backed up again.

## When Backups Are Created

- Running \`agent-sesh\` on a project whose only pointer file is hand-written:
  it is backed up here and replaced with the template.
- Choosing a set of environments that retires a pointer file (e.g. dropping
  CLAUDE.md when switching to AGENTS.md) when that file has been customised.
- When a pointer you keep and one being retired both have different custom
  content: the kept file stays as-is, and the retired one is backed up.

Backups are **not** created when:
- The pointer file matches a default agent-sesh template (any version, any name).
- An identical backup already exists.

Nothing here is ever deleted to make room for a new backup, and a file that
cannot be read is left where it is rather than being discarded.
`;

const archiveReadme = `# Project Brain Archive

This folder contains dated snapshots made when the active project brain was
reinitialised. Each snapshot preserves the previous active \`${handoffLabel}/\`
contents and includes a \`manifest.json\` with its creation details.

Archived material is historical reference, not active agent context. Agents
should read the active files in the parent \`${handoffLabel}/\` directory by
default and open a specific snapshot only when a task needs historical context.

Snapshots are never automatically deleted or merged back into the active
project brain.
`;

// ── small fs helpers ──────────────────────────────────────────────

function isRegularFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

// archive/ and old_agent_files/ are agent-sesh's own bookkeeping, not project
// brain content. One definition, used by both the "already has a brain" check
// and the reinit archive, so the two can never disagree about what is active.
function isReservedHandoffEntry(entry) {
  return entry === archiveDirName || entry === backupDirName;
}

function isHandoffPopulated() {
  if (hasLegacyLayout()) return true;
  if (!isDirectory(handoffTarget)) return false;

  try {
    return fs.readdirSync(handoffTarget).some((e) => !isReservedHandoffEntry(e));
  } catch {
    return false;
  }
}

// ── legacy flat layout ────────────────────────────────────────────
//
// Releases through 1.0.10 wrote the template files, archive/ and
// old_agent_files/ straight into `.agents/`. That squatted a namespace the
// ecosystem shares — skills/ above all — and it made the reinit archive
// unsafe, because that routine swept every entry it did not recognise.
//
// These flat names are a frozen historical fact, so they are listed rather
// than derived from agentFiles: renaming a template later must not silently
// change how an existing project migrates.
//
// The freeze applies to the *keys* always, and to the destinations from the
// first published release onward. 1.1.0 has not shipped, so its destinations
// were still editable in place; once it ships, changing one means adding a
// forward migration instead — see interimLayoutMap below for what that costs.
const legacyLayoutMap = {
  "README.md": "README.md",
  "state.md": `${memoryDirName}/state.md`,
  "pipeline.md": `${memoryDirName}/pipeline.md`,
  "tasks.md": `${memoryDirName}/tasks.md`,
  "last-session.md": `${memoryDirName}/last-session.md`,
  "decisions.md": `${memoryDirName}/decisions.md`,
  "style.md": `${rulesDirName}/style.md`,
  "constraints.md": `${rulesDirName}/constraints.md`,
  "glossary.md": `${referencesDirName}/glossary.md`,
  "roadmap.md": `${referencesDirName}/roadmap.md`,
  "context.md": `${referencesDirName}/overview.md`,
  "assumptions.md": `${referencesDirName}/assumptions.md`,
  "bugs.md": `${referencesDirName}/bugs.md`,
  "known-issues.md": `${referencesDirName}/known-issues.md`,
  "commands.md": `${referencesDirName}/commands.md`,
};

// ── interim 1.1.0 layout ──────────────────────────────────────────
//
// The first 1.1.0 development builds sorted the templates into context/ and
// reference/. Those names were replaced by rules/ and references/, which say
// what an agent should *do* with each folder rather than restating that it is
// all context.
//
// Never published — but `agent-sesh` on PATH is symlinked straight at this
// file, so locally generated projects do have the old folders. Without this
// map their content is orphaned: the flat-layout scan sees a migrated
// `.agents/`, ensureAgentsDirectory() writes fresh empty templates into the new
// folders, and describeWorkspace() then reports a healthy 15/15 over the top of
// it. Frozen for the same reason legacyLayoutMap is.
const interimLayoutMap = {
  "context/style.md": `${rulesDirName}/style.md`,
  "context/constraints.md": `${rulesDirName}/constraints.md`,
  "context/glossary.md": `${referencesDirName}/glossary.md`,
  "context/roadmap.md": `${referencesDirName}/roadmap.md`,
  "reference/overview.md": `${referencesDirName}/overview.md`,
  "reference/assumptions.md": `${referencesDirName}/assumptions.md`,
  "reference/bugs.md": `${referencesDirName}/bugs.md`,
  "reference/known-issues.md": `${referencesDirName}/known-issues.md`,
  "reference/commands.md": `${referencesDirName}/commands.md`,
};

// Emptied by the migration, then removed.
const interimDirNames = ["context", "reference"];

// Directories earlier releases created directly in `.agents/`. custom/ is
// where the pre-1.1.0 reinit parked non-standard entries; archive/ replaced it.
// All three are agent-sesh's own, so all three belong under handoff/.
const legacyDirNames = [archiveDirName, backupDirName, "custom"];

const legacyFlatNames = Object.fromEntries(
  Object.entries(legacyLayoutMap).map(([flat, destination]) => [destination, flat]),
);

// Purely read-only, so it can run before any prompt. That is what keeps the
// migration itself behind the "ask every question, then write" line that the
// rest of main() holds to.
function findLegacyLayoutEntries() {
  if (!isDirectory(target)) return [];

  let entries;
  try {
    entries = fs.readdirSync(target).sort();
  } catch {
    return [];
  }

  const found = [];

  for (const entry of entries) {
    if (entry === handoffDirName) continue;

    const entryPath = path.join(target, entry);
    const destination = legacyLayoutMap[entry];

    if (destination) {
      // A directory sharing a template's name is not ours to move.
      if (isRegularFile(entryPath)) {
        found.push({ name: entry, destination, isDirectory: false });
      }
      continue;
    }

    if (legacyDirNames.includes(entry) && isDirectory(entryPath)) {
      found.push({ name: entry, destination: entry, isDirectory: true });
    }
  }

  // Anything absent from that list — skills/, another tool's folder, a file
  // the user dropped in — is never a candidate and is never touched.
  return found;
}

// Same contract as findLegacyLayoutEntries(): read-only, so it can run before
// any prompt, and it only ever nominates paths named in the map.
function findInterimLayoutEntries() {
  if (!isDirectory(handoffTarget)) return [];

  const found = [];

  for (const [source, destination] of Object.entries(interimLayoutMap)) {
    const sourcePath = handoffPath(source);
    if (!isRegularFile(sourcePath)) continue;
    found.push({ source, sourcePath, destination });
  }

  return found;
}

function hasLegacyLayout() {
  return findLegacyLayoutEntries().length > 0 || findInterimLayoutEntries().length > 0;
}

// ── git discovery ─────────────────────────────────────────────────
//
// Everything git-related is discovered by asking git, never by guessing at
// `<cwd>/.git`. That guess broke three separate cases: worktrees and
// submodules (where `.git` is a *file*), running from a subdirectory (where
// there is no `.git` at all, and we used to offer to create a nested repo),
// and repos using core.hooksPath (where `.git/hooks` is dead weight).

function gitQuery(args) {
  try {
    return childProcess
      .execFileSync("git", args, {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
  } catch {
    return null;
  }
}

let gitInfoCache;

function getGitInfo() {
  if (gitInfoCache !== undefined) return gitInfoCache;

  const top = gitQuery(["rev-parse", "--show-toplevel"]);
  if (!top) {
    gitInfoCache = null;
    return gitInfoCache;
  }

  const topDir = canonicalPath(top);

  // Hooks live in the *common* git dir so that linked worktrees share them.
  const commonDir = gitQuery(["rev-parse", "--git-common-dir"]);
  const gitDir = commonDir ? path.resolve(projectRoot, commonDir) : null;

  // core.hooksPath overrides .git/hooks entirely (husky v5+, lefthook, …).
  const configuredHooks = gitQuery(["config", "--get", "core.hooksPath"]);
  const hooksDir = configuredHooks
    ? path.resolve(topDir, configuredHooks)
    : gitDir
      ? path.join(gitDir, "hooks")
      : null;

  gitInfoCache = {
    topDir,
    gitDir,
    hooksDir,
    usesCustomHooksPath: Boolean(configuredHooks),
    // path.relative, not ===: it ignores drive-letter case on Windows.
    inSubdirectory: path.relative(topDir, projectRoot) !== "",
  };
  return gitInfoCache;
}

// ── process helpers ───────────────────────────────────────────────

// Only an interactive run may ask for a password: a flag-driven or piped run
// must never block on a sudo prompt inside the spinner.
function canPromptForElevation() {
  return interactive && Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

function runQuiet(command, args) {
  try {
    childProcess.execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runWithElevation(command, args) {
  if (runQuiet(command, args)) {
    return true;
  }

  if (!canPromptForElevation()) {
    return false;
  }

  try {
    childProcess.execFileSync("sudo", [command, ...args], { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

// ── protection ────────────────────────────────────────────────────
//
// Protection is read-only permissions and nothing more. OS-level
// immutability (chattr +i, chflags schg/uchg) is never applied — it made the
// pointer file undeletable by git itself, which broke pull/merge/checkout.
// The `unlock*` helpers below exist purely to strip those flags off files
// created by versions <= 1.0.6 on Linux and macOS.
//
// Windows never needs an unlock step. Versions <= 1.0.6 tried to add a
// deny-write ACL through PowerShell, but that call never bound its path
// argument, so no Windows file ever received one; chmod (plus a best-effort
// `attrib -R`) is all that makes a file writable again there.

function makeReadOnly(filePath) {
  assertOwnedPath(filePath, "protect");
  let ok = true;

  try {
    fs.chmodSync(filePath, 0o444);
  } catch {
    ok = false;
  }

  // chmod already set FILE_ATTRIBUTE_READONLY on Windows; attrib is belt and
  // braces, and its absence must not report a protected file as unprotected.
  if (process.platform === "win32") {
    runQuiet("attrib", ["+R", filePath]);
  }

  return ok;
}

function makeWritable(filePath) {
  assertOwnedPath(filePath, "unprotect", { asSource: true });
  try {
    fs.chmodSync(filePath, 0o644);
  } catch {}

  if (process.platform === "win32") {
    runQuiet("attrib", ["-R", filePath]);
  }
}

function isLinuxImmutable(filePath) {
  if (process.platform !== "linux") {
    return false;
  }

  try {
    const output = childProcess.execFileSync("lsattr", ["-d", filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const attrs = output.trim().split(/\s+/)[0] || "";
    return attrs.includes("i");
  } catch {
    return false;
  }
}

function unlockLinuxImmutable(filePath) {
  if (process.platform === "linux" && isLinuxImmutable(filePath)) {
    runWithElevation("chattr", ["-i", filePath]);
  }
}

function getMacFlags(filePath) {
  if (process.platform !== "darwin") {
    return "";
  }

  try {
    return childProcess
      .execFileSync("stat", ["-f", "%Sf", filePath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
  } catch {
    return "";
  }
}

function unlockMacImmutable(filePath) {
  if (process.platform !== "darwin") {
    return;
  }

  const flags = getMacFlags(filePath);

  if (flags.includes("schg") || flags.includes("uchg")) {
    runWithElevation("chflags", ["nouchg,noschg", filePath]);
  }
}

// Legacy-only, and deliberately lazy: this spawns lsattr / stat, and runs only
// after a normal filesystem operation has already failed, so a run that has
// no legacy flags to strip never pays for it.
function unlockFileDeep(filePath) {
  unlockLinuxImmutable(filePath);
  unlockMacImmutable(filePath);
  makeWritable(filePath);
}

function withUnlockRetry(filePath, action) {
  try {
    return action();
  } catch (err) {
    if (!fs.existsSync(filePath)) throw err;
    unlockFileDeep(filePath);
    try {
      return action();
    } catch (retryErr) {
      throw new Error(`${retryErr.message}${describeRemainingLock(filePath)}`);
    }
  }
}

// The unlock retry failed too. If an immutability flag from an old release is
// still on the file, say exactly what clears it instead of leaving a bare
// EPERM.
function describeRemainingLock(filePath) {
  const shown = path.relative(projectRoot, filePath) || filePath;
  if (process.platform === "linux" && isLinuxImmutable(filePath)) {
    return `\n  The file is marked immutable. Run: sudo chattr -i ${shellQuote(shown)}`;
  }
  if (process.platform === "darwin" && /schg|uchg/.test(getMacFlags(filePath))) {
    return `\n  The file is marked immutable. Run: sudo chflags nouchg,noschg ${shellQuote(shown)}`;
  }
  return "";
}

// Every directory agent-sesh creates sits somewhere the user controls, so a
// bare "EACCES: permission denied, mkdir …" is a real possibility. Wrap it,
// the way every other failure in this file is wrapped, so the message says
// what to do instead of just what broke.
// ── ownership guard ───────────────────────────────────────────────
//
// The first invariant, as code: agent-sesh writes inside .agents/handoff/, to
// its own pointer files at the project root, and to the git hooks directory —
// nowhere else. Every mutation helper below calls this first, so a refactor
// that reaches for .agents/skills/ (or any of the other skills folders in the
// registry) fails loudly instead of quietly moving someone's skills.
//
// Moves and removals may additionally *originate* from the legacy locations
// the frozen migration maps name — the flat `.agents/*.md` files, the old
// `.agents/archive/`, `old_agent_files/` and `custom/` folders, and root
// `OLD_*.md` backups — because folding those in is the one time agent-sesh
// touches something outside handoff/. Those names are frozen, so the set of
// reachable paths is closed.
function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isOwnedPath(candidate, { asSource = false } = {}) {
  const resolved = path.resolve(candidate);

  if (isInside(handoffTarget, resolved)) return true;
  // path.relative rather than ===: case-insensitive where the filesystem is.
  if (pointerEnvironments.some((env) => path.relative(resolved, pointerPath(env)) === "")) {
    return true;
  }

  const git = getGitInfo();
  if (git && git.hooksDir && isInside(git.hooksDir, resolved)) return true;

  if (!asSource) return false;

  if (isInside(target, resolved) && resolved !== path.resolve(target)) {
    const head = path.relative(target, resolved).split(path.sep)[0];
    if (legacyLayoutMap[head] || legacyDirNames.includes(head)) return true;
  }

  const bases = pointerEnvironments.map((env) => backupBaseName(env.fileName)).join("|");
  const rootBackup = new RegExp(`^OLD_(${bases})_\\d+\\.md$`);
  return (
    path.dirname(resolved) === path.resolve(projectRoot) &&
    rootBackup.test(path.basename(resolved))
  );
}

function assertOwnedPath(candidate, verb, options) {
  if (isOwnedPath(candidate, options)) return;
  const shown = path.relative(projectRoot, path.resolve(candidate)) || ".";
  throw new Error(
    `Refusing to ${verb} ${shown}: it is outside ${handoffLabel}/ and is not an agent-sesh file. ` +
      "Nothing was changed. This is a bug in agent-sesh — please report it.",
  );
}

function makeDirectory(dirPath, label) {
  assertOwnedPath(dirPath, "create");
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (err) {
    throw new Error(
      `Cannot create ${label} (${err.message}). Fix the folder permissions and re-run agent-sesh.`,
    );
  }
}

function writeFileSafe(filePath, content) {
  assertOwnedPath(filePath, "write");
  withUnlockRetry(filePath, () => {
    if (fs.existsSync(filePath)) makeWritable(filePath);
    fs.writeFileSync(filePath, content);
  });
}

function removeFileSafe(filePath) {
  assertOwnedPath(filePath, "remove", { asSource: true });
  withUnlockRetry(filePath, () => {
    fs.unlinkSync(filePath);
  });
}

// Windows refuses to rename a folder while an indexer or scanner holds a
// handle inside it (EPERM/EBUSY) and lets go a moment later. Same idea as
// fs.rmSync's maxRetries; elsewhere a rename either works or it does not.
function renameWithRetry(srcPath, dstPath) {
  const attempts = process.platform === "win32" ? 5 : 1;
  for (let attempt = 1; ; attempt += 1) {
    try {
      fs.renameSync(srcPath, dstPath);
      return;
    } catch (err) {
      const transient = ["EPERM", "EBUSY", "EACCES"].includes(err.code);
      if (!transient || attempt >= attempts) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * 2 ** (attempt - 1));
    }
  }
}

function moveFileSafe(srcPath, dstPath) {
  assertOwnedPath(srcPath, "move", { asSource: true });
  assertOwnedPath(dstPath, "move into");
  withUnlockRetry(srcPath, () => {
    renameWithRetry(srcPath, dstPath);
  });
}

// Reads from anywhere; the destination is what has to be ours.
function copyFileSafe(srcPath, dstPath) {
  assertOwnedPath(dstPath, "copy into");
  fs.copyFileSync(srcPath, dstPath);
}

function removeDirectoryIfEmpty(dirPath) {
  assertOwnedPath(dirPath, "remove", { asSource: true });
  try {
    fs.rmdirSync(dirPath);
  } catch {}
}

function protectFile(filePath) {
  return makeReadOnly(filePath) ? "read-only" : "NOT APPLIED (permission denied)";
}

function getTemplateContent(fileName) {
  return agentsFileContent.replace(/AGENTS\.md/g, fileName);
}

// Recognition has to span every template agent-sesh has ever written, not
// just the current one. This verdict decides whether a pointer file is
// discarded as boilerplate or preserved as the user's own writing, so a
// narrow match would bury people in backups of files they never touched.
// Line endings are not content. A pointer committed from Windows with
// core.autocrlf comes back CRLF; treating that as hand-written would back it
// up and rewrite it on every run. A byte-order mark is dropped for the same
// reason.
function normalizeText(text) {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

// An absent file (undefined) never equals content; only two strings are
// compared after normalising.
function sameText(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return a === b;
  return normalizeText(a) === normalizeText(b);
}

function isDefaultTemplate(content) {
  const normalized = normalizeText(content);
  return [agentsFileContent, ...legacyPointerTemplates].some((template) =>
    pointerFileNames.some((name) => normalized === template.replace(/AGENTS\.md/g, name)),
  );
}

// ── backups ───────────────────────────────────────────────────────

let backupWasWritten = false;

// Backups are filed per pointer file, so the folder is half of the path.
// Anything reporting a backup location has to include it. AGENTS.md → agents/,
// CLAUDE.md → claude/, and so on for every environment.
function backupSubdirName(fileName) {
  return fileName.replace(/\.md$/i, "").toLowerCase();
}

function getBackupDir(fileName, { create = false } = {}) {
  const dir = path.join(handoffTarget, backupDirName, backupSubdirName(fileName));
  if (create) {
    makeDirectory(dir, `${handoffLabel}/${backupDirName}/${backupSubdirName(fileName)}/`);
  }
  return dir;
}

// OLD_AGENTS_1.md, OLD_CLAUDE_1.md, OLD_GEMINI_1.md …
function backupBaseName(fileName) {
  return fileName.replace(/\.md$/i, "").toUpperCase();
}

// Reads the directory rather than probing OLD_X_1, OLD_X_2, … in sequence.
// The sequential probe stopped at the first gap, so deleting OLD_AGENTS_1
// hid every later backup from the duplicate check and made the next backup
// reuse a number that was already taken.
function listBackups(fileName) {
  const dir = getBackupDir(fileName);
  if (!isDirectory(dir)) return [];

  const base = backupBaseName(fileName);
  const pattern = new RegExp(`^OLD_${base}_(\\d+)\\.md$`);
  const found = [];

  for (const entry of fs.readdirSync(dir)) {
    const match = entry.match(pattern);
    if (match) {
      found.push({ path: path.join(dir, entry), index: Number(match[1]) });
    }
  }

  return found.sort((a, b) => a.index - b.index);
}

function findDuplicateBackup(fileName, content) {
  for (const backup of listBackups(fileName)) {
    try {
      if (sameText(fs.readFileSync(backup.path, "utf8"), content)) return backup.path;
    } catch {
      // Unreadable backup: cannot compare, so assume it is not a match.
    }
  }
  return null;
}

// Always one past the highest existing number, never a gap: the README
// promises that the highest number is the most recent backup, and filling a
// gap left by a deleted file would break that ordering.
function getAvailableBackupPath(fileName) {
  const dir = getBackupDir(fileName, { create: true });
  const base = backupBaseName(fileName);

  let index = Math.max(0, ...listBackups(fileName).map((b) => b.index)) + 1;
  while (fs.existsSync(path.join(dir, `OLD_${base}_${index}.md`))) {
    index += 1;
  }

  return path.join(dir, `OLD_${base}_${index}.md`);
}

function ensureBackupReadme() {
  const oldAgentFilesDir = path.join(handoffTarget, backupDirName);
  makeDirectory(oldAgentFilesDir, `${handoffLabel}/${backupDirName}/`);

  const readmePath = path.join(oldAgentFilesDir, "README.md");

  if (!fs.existsSync(readmePath)) {
    writeFileSafe(readmePath, oldAgentFilesReadme);
  } else if (!sameText(fs.readFileSync(readmePath, "utf8"), oldAgentFilesReadme)) {
    writeFileSafe(readmePath, oldAgentFilesReadme);
  }

  makeReadOnly(readmePath);

  // Only folders that hold a backup get the README link; creating one folder
  // per environment up front would leave a row of empty directories behind.
  for (const env of pointerEnvironments) {
    const subdirPath = getBackupDir(env.fileName);
    if (!isDirectory(subdirPath)) continue;
    const linkPath = path.join(subdirPath, "README.md");

    try {
      // lstat rather than existsSync: a broken symlink still occupies the
      // name, and existsSync follows the link and reports false.
      let stat = null;
      try {
        stat = fs.lstatSync(linkPath);
      } catch {}

      if (stat) {
        if (stat.isSymbolicLink()) {
          const linkTarget = fs.readlinkSync(linkPath);
          if (linkTarget === path.join("..", "README.md")) continue;
        }
        removeFileSafe(linkPath);
      }
      assertOwnedPath(linkPath, "link");
      fs.symlinkSync(path.join("..", "README.md"), linkPath);
    } catch {
      // Best-effort; some filesystems and Windows configs disallow symlinks.
    }
  }
}

// The single funnel for destroying a pointer file. Nothing else in this
// file is allowed to unlink or overwrite AGENTS.md / CLAUDE.md. Previously
// the environment-switch path wrote straight over the target and deleted the
// source, so a user with two hand-written pointer files lost one of them
// outright, with no backup and no warning.
function retirePointerFile(filePath, fileName) {
  if (!isRegularFile(filePath)) {
    return { action: "absent" };
  }

  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    // If it cannot be read it cannot be preserved, so it does not get destroyed.
    return { action: "kept", reason: err.message };
  }

  if (isDefaultTemplate(content)) {
    removeFileSafe(filePath);
    return { action: "discarded" };
  }

  if (findDuplicateBackup(fileName, content)) {
    removeFileSafe(filePath);
    return { action: "already-backed-up" };
  }

  const backupPath = getAvailableBackupPath(fileName);
  moveFileSafe(filePath, backupPath);
  backupWasWritten = true;
  return { action: "backed-up", backupName: path.basename(backupPath) };
}

// Older versions dropped OLD_AGENTS_*.md / OLD_CLAUDE_*.md into the project
// root. Fold any stragglers into .agents/handoff/old_agent_files/.
//
// The previous implementation deleted every backup it could see and then
// rewrote the survivors from memory, which permanently destroyed any backup
// that happened to be unreadable, and lost the lot if a write failed midway.
// This version writes the destination first and only then removes the
// source, and never touches a file it could not read.
function migrateRootBackups() {
  const types = pointerEnvironments.map((env) => ({
    pattern: new RegExp(`^OLD_${backupBaseName(env.fileName)}_\\d+\\.md$`),
    name: env.fileName,
  }));

  const warnings = [];

  for (const type of types) {
    let rootFiles;
    try {
      rootFiles = fs
        .readdirSync(projectRoot)
        .filter((entry) => type.pattern.test(entry))
        .sort();
    } catch {
      continue;
    }

    // Nothing stranded in the root: leave the existing backups untouched
    // rather than renumbering them on every run.
    if (rootFiles.length === 0) continue;

    for (const entry of rootFiles) {
      const srcPath = path.join(projectRoot, entry);
      if (!isRegularFile(srcPath)) continue;

      let content;
      try {
        content = fs.readFileSync(srcPath, "utf8");
      } catch {
        warnings.push(`Left ${entry} in place — it could not be read.`);
        continue;
      }

      try {
        if (findDuplicateBackup(type.name, content)) {
          removeFileSafe(srcPath);
          continue;
        }

        const destPath = getAvailableBackupPath(type.name);
        writeFileSafe(destPath, content);
        backupWasWritten = true;
        removeFileSafe(srcPath);
      } catch (err) {
        warnings.push(`Could not migrate ${entry}: ${err.message}`);
      }
    }
  }

  return warnings;
}

// ── .agents directory ─────────────────────────────────────────────

function ensureAgentsDirectory() {
  if (fs.existsSync(target) && !isDirectory(target)) {
    throw new Error(
      `A ${agentsDirName} path already exists here, but it is not a folder. Move it aside and re-run agent-sesh.`,
    );
  }

  if (fs.existsSync(handoffTarget) && !isDirectory(handoffTarget)) {
    throw new Error(
      `${handoffLabel} exists but is not a folder. Move it aside and re-run agent-sesh.`,
    );
  }

  makeDirectory(handoffTarget, `${handoffLabel}/`);

  let created = 0;
  let existing = 0;

  // Per-file existence check, so a re-run tops up templates added by a newer
  // version without touching anything the user has already written.
  for (const [relativePath, content] of Object.entries(agentFiles)) {
    const filePath = handoffPath(relativePath);

    if (fs.existsSync(filePath)) {
      existing += 1;
      continue;
    }

    makeDirectory(path.dirname(filePath), handoffFolderLabel(relativePath));

    try {
      writeFileSafe(filePath, content);
    } catch (err) {
      throw new Error(
        `Cannot write ${handoffLabel}/${relativePath} (${err.message}). Fix the folder permissions and re-run agent-sesh.`,
      );
    }

    created += 1;
  }

  return { created, existing, total: Object.keys(agentFiles).length };
}

function formatArchiveTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  const offsetPart = `${sign}${pad(Math.floor(absoluteOffset / 60))}-${pad(absoluteOffset % 60)}`;

  return `${datePart}T${timePart}${offsetPart}`;
}

function getAvailableArchivePath(archiveDir, timestamp) {
  let suffix = 0;

  while (true) {
    const name = suffix === 0 ? timestamp : `${timestamp}-${suffix}`;
    const candidate = path.join(archiveDir, name);
    if (!fs.existsSync(candidate)) return { name, path: candidate };
    suffix += 1;
  }
}

function getTemporaryArchivePath(archiveDir, timestamp) {
  let suffix = 0;

  while (true) {
    const name = `.tmp-${timestamp}-${process.pid}${suffix ? `-${suffix}` : ""}`;
    const candidate = path.join(archiveDir, name);
    if (!fs.existsSync(candidate)) return candidate;
    suffix += 1;
  }
}

function validateArchiveEntry(entryPath, relativePath, includedPaths) {
  let stat;
  try {
    stat = fs.lstatSync(entryPath);
  } catch (err) {
    throw new Error(`Cannot inspect ${relativePath}: ${err.message}`);
  }

  if (stat.isSymbolicLink()) {
    try {
      fs.readlinkSync(entryPath);
    } catch (err) {
      throw new Error(`Cannot read symbolic link ${relativePath}: ${err.message}`);
    }
    includedPaths.push(relativePath);
    return;
  }

  if (stat.isDirectory()) {
    let entries;
    try {
      entries = fs.readdirSync(entryPath).sort();
    } catch (err) {
      throw new Error(`Cannot read directory ${relativePath}: ${err.message}`);
    }

    includedPaths.push(`${relativePath}/`);
    for (const entry of entries) {
      validateArchiveEntry(
        path.join(entryPath, entry),
        `${relativePath}/${entry}`,
        includedPaths,
      );
    }
    return;
  }

  if (stat.isFile()) {
    let descriptor;
    try {
      descriptor = fs.openSync(entryPath, "r");
    } catch (err) {
      throw new Error(`Cannot read ${relativePath}: ${err.message}`);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    includedPaths.push(relativePath);
    return;
  }

  throw new Error(`Cannot archive ${relativePath}: unsupported filesystem entry.`);
}

function getArchiveDirectory() {
  const archiveDir = path.join(handoffTarget, archiveDirName);

  if (fs.existsSync(archiveDir) && !isDirectory(archiveDir)) {
    throw new Error(
      `${handoffLabel}/${archiveDirName} exists but is not a folder. Move it aside and re-run agent-sesh.`,
    );
  }

  try {
    makeDirectory(archiveDir, `${handoffLabel}/${archiveDirName}/`);
    ensureArchiveReadme(archiveDir);
  } catch (err) {
    throw new Error(
      `Cannot prepare ${handoffLabel}/${archiveDirName}: ${err.message}`,
    );
  }

  return archiveDir;
}

function ensureArchiveReadme(archiveDir) {
  const readmePath = path.join(archiveDir, "README.md");

  if (!fs.existsSync(readmePath)) {
    writeFileSafe(readmePath, archiveReadme);
    return;
  }

  if (!isRegularFile(readmePath)) {
    throw new Error(
      `${handoffLabel}/${archiveDirName}/README.md exists but is not a regular file. Move it aside and re-run agent-sesh.`,
    );
  }
}

// formatVersion 2: includedPaths are relative to `.agents/handoff/`, not
// `.agents/`. A version 1 manifest describes the old flat layout.
function buildArchiveManifest(createdAt, includedPaths, excludedPaths) {
  const git = getGitInfo();
  const manifest = {
    formatVersion: 2,
    createdAt: formatArchiveTimestamp(createdAt),
    agentSeshVersion: VERSION,
    includedPaths,
    excludedPaths,
  };

  if (git) {
    manifest.sourceProjectRootRelativeToWorktree =
      path.relative(git.topDir, projectRoot).split(path.sep).join("/") || ".";
    manifest.git = {
      commit: gitQuery(["rev-parse", "HEAD"]) || null,
      branch: gitQuery(["branch", "--show-current"]) || null,
    };
  }

  return manifest;
}

// Pointer backups are numbered, not named, so a collision on OLD_AGENTS_1.md
// is a collision on the number rather than on the content. Renumbering into
// the next free slot is the right answer: a plain merge would strand the file
// in `.agents/`, which is the exact thing this migration exists to clean up.
//
// Everything else in the folder — the README, the symlinks — merges normally.
function migrateLegacyBackups(sourceDir, warnings) {
  for (const type of pointerFileNames) {
    const subdir = path.join(sourceDir, backupSubdirName(type));
    if (!isDirectory(subdir)) continue;

    const pattern = new RegExp(`^OLD_${backupBaseName(type)}_(\\d+)\\.md$`);
    const entries = fs
      .readdirSync(subdir)
      .filter((entry) => pattern.test(entry))
      .sort((a, b) => Number(a.match(pattern)[1]) - Number(b.match(pattern)[1]));

    for (const entry of entries) {
      const sourcePath = path.join(subdir, entry);
      if (!isRegularFile(sourcePath)) continue;

      let content;
      try {
        content = fs.readFileSync(sourcePath, "utf8");
      } catch {
        warnings.push(`Left ${agentsDirName}/${backupDirName}/${backupSubdirName(type)}/${entry} in place — it could not be read.`);
        continue;
      }

      try {
        // Content already preserved under some other number: drop the copy.
        if (findDuplicateBackup(type, content)) {
          removeFileSafe(sourcePath);
          continue;
        }

        // Write before removing, so a failure never loses the only copy.
        const destinationPath = getAvailableBackupPath(type);
        writeFileSafe(destinationPath, content);
        backupWasWritten = true;
        removeFileSafe(sourcePath);
      } catch (err) {
        warnings.push(`Could not migrate ${entry}: ${err.message}`);
      }
    }
  }
}

// Folds one directory into another, entry by entry.
//
// A plain rename is not enough: taking the pre-migration snapshot creates
// handoff/archive/, so by the time the legacy archive/ is moved its
// destination already exists and renaming onto it fails with ENOTEMPTY.
// Merging is also simply the right answer when a project somehow has both.
function mergeDirectoryInto(sourceDir, destinationDir, sourceLabel, destinationLabel, warnings) {
  makeDirectory(destinationDir, `${destinationLabel}/`);

  for (const entry of fs.readdirSync(sourceDir).sort()) {
    const sourcePath = path.join(sourceDir, entry);
    const destinationPath = path.join(destinationDir, entry);

    if (!fs.existsSync(destinationPath)) {
      moveFileSafe(sourcePath, destinationPath);
      continue;
    }

    if (isDirectory(sourcePath) && isDirectory(destinationPath)) {
      mergeDirectoryInto(
        sourcePath,
        destinationPath,
        `${sourceLabel}/${entry}`,
        `${destinationLabel}/${entry}`,
        warnings,
      );
      continue;
    }

    // Identical boilerplate on both sides is not worth bothering anyone about.
    if (isRegularFile(sourcePath) && isRegularFile(destinationPath)) {
      try {
        if (sameText(fs.readFileSync(sourcePath, "utf8"), fs.readFileSync(destinationPath, "utf8"))) {
          removeFileSafe(sourcePath);
          continue;
        }
      } catch {
        // Unreadable: fall through and leave it alone rather than guess.
      }
    }

    warnings.push(
      `Left ${sourceLabel}/${entry} where it is — ${destinationLabel}/${entry} already exists and differs.`,
    );
  }

  // Succeeds only once everything has moved out; anything left behind was
  // reported above.
  removeDirectoryIfEmpty(sourceDir);
}

// Copies the flat layout aside before it is moved. The reinit archive moves
// its material, but here the originals go on to become the live files, so
// this has to be a copy.
//
// archive/ and old_agent_files/ are deliberately not copied: both are already
// historical, both relocate with a single atomic directory rename that has no
// partial state to recover from, and copying archive/ into its own new home
// would recurse.
function backupLegacyLayout(entries) {
  const archiveDir = getArchiveDirectory();

  const createdAt = new Date();
  const timestamp = `${formatArchiveTimestamp(createdAt)}-pre-handoff-migration`;
  const destination = getAvailableArchivePath(archiveDir, timestamp);
  const temporaryPath = getTemporaryArchivePath(archiveDir, timestamp);

  const copied = entries.filter((entry) => !entry.isDirectory);
  const notCopied = entries.filter((entry) => entry.isDirectory).map((e) => e.name);

  try {
    makeDirectory(temporaryPath, `${handoffLabel}/${archiveDirName}/${destination.name}/`);

    const includedPaths = [];
    for (const entry of copied) {
      const sourcePath = path.join(target, entry.name);
      validateArchiveEntry(sourcePath, entry.name, includedPaths);
      copyFileSafe(sourcePath, path.join(temporaryPath, entry.name));
    }

    const manifest = buildArchiveManifest(createdAt, includedPaths, notCopied);
    manifest.migration = {
      from: "flat",
      to: handoffDirName,
      movedWithoutCopy: notCopied,
      renames: Object.fromEntries(
        entries
          .filter((entry) => !entry.isDirectory && entry.name !== entry.destination)
          .map((entry) => [entry.name, entry.destination]),
      ),
    };

    const manifestPath = path.join(temporaryPath, "manifest.json");
    writeFileSafe(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    moveFileSafe(temporaryPath, destination.path);
  } catch (err) {
    throw new Error(
      `Could not back up the existing project brain before migrating: ${err.message}`,
    );
  }

  return {
    name: destination.name,
    relativePath: `${handoffLabel}/${archiveDirName}/${destination.name}/`,
    itemCount: copied.length,
  };
}

// One warning, never one per file: a project caught mid-migration can hit this
// on every template at once, and a wall of near-identical paragraphs buries the
// rest of the run.
function describeMigrationConflicts(pairs) {
  const shown = pairs.slice(0, 5);
  // Two lines per pair: the two paths together do not fit an 80-column note.
  const lines = shown.map((pair) => `  ${pair.from}\n    → ${pair.to}`);

  if (pairs.length > shown.length) {
    lines.push(`  …and ${pairs.length - shown.length} more`);
  }

  return [
    `${pairs.length} file(s) were left in place because their new location already exists:`,
    ...lines,
    "Merge each pair by hand, then delete the original.",
  ].join("\n");
}

// Folds the interim 1.1.0 folders into the current ones.
//
// No snapshot here, unlike the flat migration. That one lifts an entire project
// brain out of a namespace it shared with other tools; this is a rename inside a
// folder agent-sesh already owns, so nothing leaves handoff/ and nothing is
// deleted. The asymmetry is deliberate.
function migrateInterimLayout(entries, warnings) {
  if (entries.length === 0) return 0;

  const conflicts = [];
  let moved = 0;

  for (const entry of entries) {
    const destinationPath = handoffPath(entry.destination);

    if (fs.existsSync(destinationPath)) {
      conflicts.push(entry);
      continue;
    }

    try {
      makeDirectory(
        path.dirname(destinationPath),
        handoffFolderLabel(entry.destination),
      );
      moveFileSafe(entry.sourcePath, destinationPath);
    } catch (err) {
      throw new Error(
        `Could not move ${handoffLabel}/${entry.source} to ${handoffLabel}/${entry.destination}. ` +
          `Nothing was deleted; ${moved} file(s) had already moved. ${err.message}`,
      );
    }

    moved += 1;
  }

  if (conflicts.length > 0) {
    warnings.push(
      describeMigrationConflicts(
        conflicts.map((entry) => ({
          from: `${handoffLabel}/${entry.source}`,
          to: `${handoffLabel}/${entry.destination}`,
        })),
      ),
    );
  }

  // Succeeds only once everything has moved out; anything the user left behind
  // keeps its folder, and the warning above already named it.
  for (const dirName of interimDirNames) {
    removeDirectoryIfEmpty(handoffPath(dirName));
  }

  return moved;
}

// Folds a flat `.agents/` layout, and any interim 1.1.0 layout, into the
// current one. Idempotent: a second run finds nothing to move. Detection is
// per-entry, so an interrupted or half-merged tree is finished rather than
// refused.
function migrateToHandoffLayout() {
  const entries = findLegacyLayoutEntries();
  const interimEntries = findInterimLayoutEntries();
  if (entries.length === 0 && interimEntries.length === 0) return null;

  if (fs.existsSync(handoffTarget) && !isDirectory(handoffTarget)) {
    throw new Error(
      `${handoffLabel} exists but is not a folder. Move it aside and re-run agent-sesh.`,
    );
  }

  const warnings = [];
  const movable = [];
  const conflicts = [];

  // An occupied destination means a half-migrated tree. For files that is a
  // conflict: never overwrite, leave that one alone, say so, migrate the rest.
  // Directories merge instead, so for them it is not a conflict at all.
  for (const entry of entries) {
    const destinationPath = handoffPath(entry.destination);

    if (!entry.isDirectory && fs.existsSync(destinationPath)) {
      conflicts.push(entry);
      continue;
    }

    movable.push({ ...entry, destinationPath });
  }

  if (conflicts.length > 0) {
    warnings.push(
      describeMigrationConflicts(
        conflicts.map((entry) => ({
          from: `${agentsDirName}/${entry.name}`,
          to: `${handoffLabel}/${entry.destination}`,
        })),
      ),
    );
  }

  if (movable.length === 0) {
    return {
      moved: migrateInterimLayout(interimEntries, warnings),
      warnings,
      snapshot: null,
    };
  }

  makeDirectory(handoffTarget, `${handoffLabel}/`);

  const snapshot = backupLegacyLayout(movable);

  let moved = 0;
  try {
    for (const entry of movable) {
      const sourcePath = path.join(target, entry.name);

      if (entry.isDirectory) {
        if (entry.name === backupDirName) {
          // Renumber the pointer backups first; the README and its symlinks
          // are left for the merge below.
          migrateLegacyBackups(sourcePath, warnings);
        }

        mergeDirectoryInto(
          sourcePath,
          entry.destinationPath,
          `${agentsDirName}/${entry.name}`,
          `${handoffLabel}/${entry.destination}`,
          warnings,
        );
      } else {
        makeDirectory(
          path.dirname(entry.destinationPath),
          handoffFolderLabel(entry.destination),
        );
        // moveFileSafe retries through unlockFileDeep, which strips the
        // chattr +i / chflags immutability left by versions <= 1.0.6.
        moveFileSafe(sourcePath, entry.destinationPath);
      }

      moved += 1;
    }
  } catch (err) {
    throw new Error(
      `Could not finish moving the project brain into ${handoffLabel}/. Nothing was deleted: ` +
        `${moved} of ${movable.length} item(s) had already moved, and a copy of the original ` +
        `files is in ${snapshot.relativePath}. ${err.message}`,
    );
  }

  // After the flat phase, so a project carrying both layouts resolves the
  // shared destinations in a defined order rather than racing for them.
  moved += migrateInterimLayout(interimEntries, warnings);

  return { moved, warnings, snapshot };
}

function archiveAndReinitializeAgentsDirectory() {
  // Migrate first, so the snapshot below sees a categorised tree rather than
  // the mix of layouts it would otherwise have to reason about.
  const migration = migrateToHandoffLayout();

  if (!isDirectory(handoffTarget)) {
    throw new Error(`Cannot reinitialise ${handoffLabel}/: it is not a directory.`);
  }

  const archiveDir = getArchiveDirectory();

  // Scoped to handoffTarget, never to target. `.agents/skills/` and every
  // other third-party entry sits outside this subtree, so the archive cannot
  // reach them however the directory is arranged.
  let activeEntries;
  try {
    activeEntries = fs
      .readdirSync(handoffTarget)
      .filter((entry) => !isReservedHandoffEntry(entry))
      .sort();
  } catch (err) {
    throw new Error(`Cannot read ${handoffLabel}/: ${err.message}`);
  }

  const includedPaths = [];
  for (const entry of activeEntries) {
    validateArchiveEntry(path.join(handoffTarget, entry), entry, includedPaths);
  }

  const createdAt = new Date();
  const timestamp = formatArchiveTimestamp(createdAt);
  const destination = getAvailableArchivePath(archiveDir, timestamp);
  const temporaryPath = getTemporaryArchivePath(archiveDir, timestamp);

  assertOwnedPath(temporaryPath, "create");
  try {
    fs.mkdirSync(temporaryPath);
  } catch (err) {
    throw new Error(`Could not create a temporary archive: ${err.message}`);
  }

  const movedEntries = [];
  try {
    for (const entry of activeEntries) {
      moveFileSafe(path.join(handoffTarget, entry), path.join(temporaryPath, entry));
      movedEntries.push(entry);
    }

    const manifestPath = path.join(temporaryPath, "manifest.json");
    const manifest = buildArchiveManifest(createdAt, includedPaths, [
      archiveDirName,
      backupDirName,
    ]);
    writeFileSafe(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    // Both directories live under the same archive folder, so this final rename is
    // atomic on normal local filesystems and never overwrites another snapshot.
    moveFileSafe(temporaryPath, destination.path);
  } catch (err) {
    const recoveryPath = path
      .relative(projectRoot, temporaryPath)
      .split(path.sep)
      .join("/");
    const movedSummary = movedEntries.length
      ? `${movedEntries.length} active item(s) were moved to ${recoveryPath}.`
      : "No active files were moved.";
    throw new Error(
      `Could not finish the archive; the original content is recoverable. ${movedSummary} ${err.message}`,
    );
  }

  return {
    name: destination.name,
    itemCount: activeEntries.length,
    pathCount: includedPaths.length,
    migration,
  };
}

// ── pointer file ──────────────────────────────────────────────────

function ensureAgentsFile(filePath, fileName) {
  const content = getTemplateContent(fileName);

  if (fs.existsSync(filePath) && !isRegularFile(filePath)) {
    throw new Error(
      `${fileName} exists but is not a regular file. Move it aside and re-run agent-sesh.`,
    );
  }

  if (!fs.existsSync(filePath)) {
    writeFileSafe(filePath, content);
    return "created";
  }

  let existing;
  try {
    existing = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(
      `Cannot read ${fileName} (${err.message}). Fix its permissions and re-run agent-sesh.`,
    );
  }

  if (sameText(existing, content)) return "unchanged";

  const retired = retirePointerFile(filePath, fileName);

  if (retired.action === "kept") {
    throw new Error(
      `Refusing to replace ${fileName}: it could not be read (${retired.reason}), so its contents cannot be preserved.`,
    );
  }

  writeFileSafe(filePath, content);

  if (retired.action === "backed-up") return retired.backupName;
  return retired.action === "already-backed-up"
    ? "recreated-duplicate"
    : "recreated-template";
}

// Reads every pointer file up front, so the decisions below are made against
// one consistent snapshot and an unreadable file stops the run before anything
// is written. Read-only, so it doubles as the pre-prompt validation.
function readPointerFiles() {
  const contents = new Map();

  for (const env of pointerEnvironments) {
    const filePath = pointerPath(env);
    if (!fs.existsSync(filePath)) continue;

    if (!isRegularFile(filePath)) {
      throw new Error(
        `${env.fileName} exists but is not a regular file. Move it aside and re-run agent-sesh.`,
      );
    }

    try {
      contents.set(env.id, fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      throw new Error(
        `Cannot read ${env.fileName} (${err.message}). Fix its permissions and re-run agent-sesh.`,
      );
    }
  }

  return contents;
}

// Rewrites references so a mirrored file talks about itself. Copying the bytes
// verbatim left CLAUDE.md saying "Do not edit this AGENTS.md file", which is
// exactly the instruction that stops an agent overwriting it.
function mirrorPointer(content, fromName, toName) {
  return content.split(fromName).join(toName);
}

// What a pointer file on disk is, from agent-sesh's point of view:
//
//   template  byte-for-byte one of the bodies agent-sesh has ever written
//   adopted   hand-edited, but it still points at .agents/handoff/ — the
//             user's customised pointer, theirs to keep
//   foreign   hand-written and does not mention the brain at all — a file
//             from before agent-sesh, or one an agent turned into notes
//
// The distinction is what makes a run idempotent: an adopted pointer stays
// adopted, so running the same command twice changes nothing.
function classifyPointer(content) {
  if (isDefaultTemplate(content)) return "template";
  return content.includes(`${handoffLabel}/`) ? "adopted" : "foreign";
}

// Brings the root pointer files in line with the chosen environments, without
// ever discarding hand-written content. The rules, in order:
//
//   • A pointer that was not chosen is retired: a template is discarded,
//     anything else is backed up under old_agent_files/.
//   • One adopted pointer is the source, preferring one that is being kept.
//     Chosen pointers that are absent, templates or foreign become its mirror
//     (a foreign one is backed up first); other adopted ones are kept as they
//     are. Retiring a source whose content differs from what stays is
//     reported, so nothing disappears silently.
//   • With no adopted pointer anywhere, every chosen pointer gets the current
//     template: created, left alone, refreshed from an older template, or —
//     for a foreign file — backed up and replaced. That last case is
//     onboarding a project that already had an AGENTS.md, and the summary
//     says where the original went.
//
// keepExisting is the reinit path: a brain reset changes .agents/handoff/, not
// the root instructions, so every pointer already here stays exactly as it is
// and nothing is retired.
function reconcilePointers(selected, { keepExisting = false } = {}) {
  const contents = readPointerFiles();
  const selectedIds = new Set(selected.map((env) => env.id));
  const present = pointerEnvironments.filter((env) => contents.has(env.id));
  const kinds = new Map(present.map((env) => [env.id, classifyPointer(contents.get(env.id))]));
  const adopted = present.filter((env) => kinds.get(env.id) === "adopted");

  const results = [];
  const retired = [];
  const backups = [];
  const divergent = [];
  const conflicts = [];

  const record = (env, status) => results.push({ env, status });
  const noteBackup = (env, outcome) => {
    if (outcome.action === "backed-up") backups.push({ env, backupName: outcome.backupName });
  };

  if (keepExisting) {
    for (const env of selected) {
      record(
        env,
        contents.has(env.id) ? "unchanged" : ensureAgentsFile(pointerPath(env), env.fileName),
      );
    }
    return { results, retired, backups, divergent, conflicts, source: null };
  }

  const toRetire = present.filter((env) => !selectedIds.has(env.id));
  const source =
    adopted.find((env) => selectedIds.has(env.id)) ||
    adopted.find((env) => !selectedIds.has(env.id)) ||
    null;

  for (const env of selected) {
    const filePath = pointerPath(env);
    const kind = kinds.get(env.id) || "absent";

    if (source && source.id === env.id) {
      record(env, "kept existing");
      continue;
    }

    if (source) {
      const existing = contents.get(env.id);
      const mirrored = mirrorPointer(contents.get(source.id), source.fileName, env.fileName);

      if (kind === "adopted") {
        // Its own customisations win over a mirror. Two kept pointers that
        // disagree are worth a note, not an intervention.
        if (!sameText(existing, mirrored)) divergent.push(env);
        record(env, "kept existing");
        continue;
      }

      if (sameText(existing, mirrored)) {
        record(env, "unchanged");
        continue;
      }

      // A foreign file is kept recoverable before the mirror lands on it.
      if (kind === "foreign") noteBackup(env, retirePointerFile(filePath, env.fileName));

      writeFileSafe(filePath, mirrored);
      record(env, `migrated from ${source.fileName}`);
      continue;
    }

    // No source, so the template. ensureAgentsFile backs a foreign file up
    // first and refreshes an older template in place.
    const status = ensureAgentsFile(filePath, env.fileName);
    if (isBackupStatus(status)) backups.push({ env, backupName: status });
    record(env, status);
  }

  for (const env of toRetire) {
    const outcome = retirePointerFile(pointerPath(env), env.fileName);
    retired.push({ env, outcome });
    noteBackup(env, outcome);

    // A retired pointer whose customisations differ from what stays is the
    // one case where content the user wrote is no longer live anywhere.
    if (
      source &&
      outcome.action === "backed-up" &&
      !sameText(
        contents.get(env.id),
        mirrorPointer(contents.get(source.id), source.fileName, env.fileName),
      )
    ) {
      conflicts.push({ kept: source, retired: env, backupName: outcome.backupName });
    }
  }

  return { results, retired, backups, divergent, conflicts, source };
}

function getAgentsDirectoryStatus(created, existing, total) {
  if (created === total) {
    return `${total} files created`;
  }

  if (created === 0) {
    return `ready (${existing} existing, 0 created)`;
  }

  return `ready (${created} created, ${existing} existing)`;
}

// A status that is not one of the known keywords is the filename of the
// backup that was just written.
function isBackupStatus(status) {
  return status.startsWith("OLD_");
}

function getAgentsFileStatus(status) {
  if (status === "created") return "created";
  if (status === "unchanged") return "already configured";
  if (status === "recreated-template")
    return "recreated (previous file was an unmodified template)";
  if (status === "recreated-duplicate")
    return "recreated (an identical backup already exists)";
  if (status === "kept existing") return "kept your existing file";
  if (status.startsWith("migrated from")) return status;
  return `created; previous file saved as ${status}`;
}

// ── git hooks ─────────────────────────────────────────────────────

const HOOK_MARKER_START = "# >>> agent-sesh >>>";
const HOOK_MARKER_END = "# <<< agent-sesh <<<";
const HOOK_NAMES = ["post-merge", "post-checkout"];

function shellQuote(value) {
  return `'${String(value).split("'").join("'\\''")}'`;
}

function buildHookBlock(relDir) {
  const quoted = pointerFileNames
    .map((name) => shellQuote(relDir ? `${relDir}/${name}` : name))
    .join(" ");

  return [
    HOOK_MARKER_START,
    "# Re-applies read-only protection to agent-sesh pointer files.",
    "# Managed by agent-sesh; edits inside this block will be overwritten.",
    `for agent_sesh_file in ${quoted}; do`,
    '    if [ -f "$agent_sesh_file" ]; then',
    '        chmod 444 "$agent_sesh_file" 2>/dev/null || true',
    "    fi",
    "done",
    "unset agent_sesh_file",
    HOOK_MARKER_END,
  ].join("\n");
}

function stripHookBlock(source) {
  const start = source.indexOf(HOOK_MARKER_START);
  if (start === -1) return null;

  const end = source.indexOf(HOOK_MARKER_END, start);
  if (end === -1) return null;

  return source.slice(0, start) + source.slice(end + HOOK_MARKER_END.length);
}

function isShellScript(source) {
  const firstLine = source.split("\n", 1)[0] || "";
  if (!firstLine.startsWith("#!")) return false;
  return /\b(sh|bash|dash|zsh|ksh)\b/.test(firstLine);
}

// Never clobbers a hook it does not own. git-lfs installs post-merge and
// post-checkout — exactly the two hooks here — and overwriting them silently
// stops LFS files being materialised on pull and checkout.
function installHook(hooksDir, name, block) {
  const hookPath = path.join(hooksDir, name);

  const finish = () => {
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(hookPath, 0o755);
      } catch {}
    }
  };

  if (!fs.existsSync(hookPath)) {
    writeFileSafe(hookPath, `#!/bin/sh\n${block}\n`);
    finish();
    return "installed";
  }

  const source = fs.readFileSync(hookPath, "utf8");
  const withoutOurs = stripHookBlock(source);

  // Keep whatever line endings the existing hook uses rather than mixing them.
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const ownBlock = block.split("\n").join(eol);

  if (withoutOurs !== null) {
    const rebuilt = `${withoutOurs.replace(/\s*$/, "")}${eol}${ownBlock}${eol}`;
    if (rebuilt !== source) writeFileSafe(hookPath, rebuilt);
    finish();
    return "updated";
  }

  if (!isShellScript(source)) {
    return "foreign";
  }

  writeFileSafe(hookPath, `${source.replace(/\s*$/, "")}${eol}${eol}${ownBlock}${eol}`);
  finish();
  return "appended";
}

const NO_REPOSITORY_WARNING = [
  "No git repository here, so the protection hooks were not installed.",
  "",
  "Without them, the pointer files lose their read-only flag whenever git",
  "replaces them (pull, merge, checkout). Nothing else breaks — run",
  "`git init` and then agent-sesh again to install them.",
].join("\n");

// Asked up front, alongside the other questions, because it decides whether
// hooks can be installed at all. Asking it after the files were already
// written made it read as an afterthought.
async function ensureGitRepository() {
  if (getGitInfo()) return null;

  if (!interactive) return NO_REPOSITORY_WARNING;

  const choice = await select({
    message: "No git repository here. Create one so the hooks can be installed?",
    options: [
      {
        value: "yes",
        label: "Yes — run git init",
        hint: "recommended",
      },
      { value: "no", label: "No — I'll do it later" },
    ],
  });

  if (isCancel(choice) || choice !== "yes") {
    return NO_REPOSITORY_WARNING;
  }

  try {
    childProcess.execFileSync("git", ["init", "--initial-branch=main"], {
      cwd: projectRoot,
      stdio: "ignore",
    });
  } catch {
    // --initial-branch needs git >= 2.28; fall back for older installs.
    try {
      childProcess.execFileSync("git", ["init"], {
        cwd: projectRoot,
        stdio: "ignore",
      });
    } catch (err) {
      return `git init failed (${err.message}). Run it manually, then re-run agent-sesh.`;
    }
  }

  gitInfoCache = undefined;

  return getGitInfo()
    ? null
    : "git init ran but the repository could not be read.";
}

// Always runs when a repository exists: hooks are reinstalled or refreshed on
// every run, so a repo whose agent-sesh hooks were deleted heals by itself
// without needing to ask.
function installGitHooks() {
  const warnings = [];
  const notes = [];
  const installed = [];
  const giveUp = (warning) => ({ warnings: [warning], notes, installed });
  const git = getGitInfo();

  if (!git) {
    return { warnings, notes, installed };
  }

  if (!git.hooksDir) {
    return giveUp("Could not locate the git hooks directory; hooks were not installed.");
  }

  if (git.inSubdirectory) {
    notes.push(
      [
        "Files were created in this folder, but the git repository root is",
        `  ${shortenPath(git.topDir)}`,
        "Hooks were installed on that repository.",
      ].join("\n"),
    );
  }

  if (git.usesCustomHooksPath) {
    notes.push(
      [
        "This repository sets core.hooksPath, so hooks were installed in",
        `  ${shortenPath(git.hooksDir)}`,
      ].join("\n"),
    );
  }

  try {
    assertOwnedPath(git.hooksDir, "create");
    fs.mkdirSync(git.hooksDir, { recursive: true });
  } catch (err) {
    return giveUp(`Could not create ${git.hooksDir}: ${err.message}`);
  }

  const relDir = path
    .relative(git.topDir, path.resolve(projectRoot))
    .split(path.sep)
    .join("/");
  const block = buildHookBlock(relDir);

  const foreign = [];
  const appended = [];
  const failed = [];

  for (const name of HOOK_NAMES) {
    try {
      const result = installHook(git.hooksDir, name, block);
      if (result === "foreign") foreign.push(name);
      else installed.push(name);
      if (result === "appended") appended.push(name);
    } catch (err) {
      failed.push(`${name} (${err.message})`);
    }
  }

  if (appended.length) {
    notes.push(
      [
        `Existing ${appended.join(" and ")} hook${appended.length > 1 ? "s were" : " was"} kept;`,
        "the agent-sesh block was appended.",
      ].join("\n"),
    );
  }

  if (foreign.length) {
    warnings.push(
      [
        `Left the existing ${foreign.join(" and ")} hook${foreign.length > 1 ? "s" : ""} untouched.`,
        "",
        "The file is not a shell script, so the protection block was not added.",
        "Add it by hand to re-apply protection after git operations:",
        "",
        block,
      ].join("\n"),
    );
  }

  if (failed.length) {
    warnings.push(`Could not install hook(s): ${failed.join(", ")}`);
  }

  return { warnings, notes, installed };
}
// ── agent detection ───────────────────────────────────────────────
//
// The same markers skills checks, so the two tools agree about which agents
// are on this machine. Detection only ever reads.

const homeDir = require("os").homedir();
const configHome =
  (process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.trim()) ||
  path.join(homeDir, ".config");

// Turns one registry marker into something checkable. The first alternative
// that resolves wins; an unset override variable falls through to the next.
function resolveDetectMarker(marker) {
  if (marker.startsWith("pkg:")) return { dependency: marker.slice(4) };

  for (const alternative of marker.split("|")) {
    if (alternative.startsWith("$")) {
      const [variable, ...rest] = alternative.slice(1).split("/");
      const value = process.env[variable] && process.env[variable].trim();
      if (!value) continue;
      return { path: rest.length ? path.join(value, ...rest) : value };
    }
    if (alternative.startsWith("~/")) return { path: path.join(homeDir, alternative.slice(2)) };
    if (alternative.startsWith("./")) return { path: path.join(projectRoot, alternative.slice(2)) };
    if (alternative.startsWith("config/")) {
      return { path: path.join(configHome, alternative.slice("config/".length)) };
    }
    return { path: alternative };
  }

  return null;
}

let projectDependenciesCache;

function projectDependencies() {
  if (projectDependenciesCache) return projectDependenciesCache;

  projectDependenciesCache = new Set();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    for (const field of ["dependencies", "devDependencies"]) {
      for (const name of Object.keys(pkg[field] || {})) projectDependenciesCache.add(name);
    }
  } catch {}

  return projectDependenciesCache;
}

function isAgentDetected(agent) {
  return agent.detect.some((marker) => {
    const resolved = resolveDetectMarker(marker);
    if (!resolved) return false;
    if (resolved.dependency) return projectDependencies().has(resolved.dependency);
    return fs.existsSync(resolved.path);
  });
}

let detectedAgentsCache;

function detectedAgents() {
  if (!detectedAgentsCache) {
    detectedAgentsCache = agentRegistry.filter((agent) => !agent.hidden && isAgentDetected(agent));
  }
  return detectedAgentsCache;
}

// ── skills discovery ──────────────────────────────────────────────
//
// Read-only and never fatal. This exists to *report* what `npx skills` has
// installed, so a dangling symlink or an unreadable SKILL.md is a finding to
// show, not a reason to stop the run.
//
// Only the required `name` scalar is read from the frontmatter — skills' own
// parser needs no more to accept a skill — so a YAML dependency is not
// warranted for it.
function parseSkillFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};

  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!pair) continue;
    let value = pair[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    fields[pair[1]] = value;
  }
  return fields;
}

// Every folder skills might have installed into here, deduplicated — most
// registry agents share `.agents/skills/`.
function skillsFolders() {
  const seen = new Set();
  const folders = [];
  for (const dir of [canonicalSkillsDir, ...agentRegistry.map((agent) => agent.skillsDir)]) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    folders.push(dir);
  }
  return folders;
}

function agentsUsingFolder(dir) {
  return agentRegistry
    .filter((agent) => !agent.hidden && agent.skillsDir === dir)
    .map((agent) => agent.name);
}

function discoverSkills() {
  const byName = new Map();
  const broken = [];
  const folders = [];

  for (const dir of skillsFolders()) {
    const dirPath = path.join(projectRoot, ...dir.split("/"));
    if (!isDirectory(dirPath)) continue;

    let entries;
    try {
      entries = fs.readdirSync(dirPath).sort();
    } catch {
      continue;
    }

    let found = 0;
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry);

      let stat;
      try {
        stat = fs.lstatSync(entryPath);
      } catch {
        continue;
      }

      // skills links each agent folder back to the canonical copy. A link
      // whose target has gone is exactly the kind of thing worth surfacing.
      if (stat.isSymbolicLink() && !fs.existsSync(entryPath)) {
        broken.push({ name: entry, folder: dir });
        continue;
      }
      if (!isDirectory(entryPath)) continue;

      const skillFile = path.join(entryPath, "SKILL.md");
      if (!isRegularFile(skillFile)) continue;

      let fields = {};
      try {
        fields = parseSkillFrontmatter(fs.readFileSync(skillFile, "utf8"));
      } catch {}

      const name = typeof fields.name === "string" && fields.name ? fields.name : entry;
      found += 1;

      const known = byName.get(name);
      if (known) known.folders.push(dir);
      else byName.set(name, { name, folders: [dir] });
    }

    if (found > 0) folders.push(dir);
  }

  // skills' project lock, when present, says where each skill came from.
  let lock = null;
  const lockPath = path.join(projectRoot, skillsLockFileName);
  if (isRegularFile(lockPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      if (parsed && typeof parsed === "object" && parsed.skills) lock = parsed;
    } catch {}
  }

  const skills = [...byName.values()].map((skill) => ({
    ...skill,
    agents: [...new Set(skill.folders.flatMap(agentsUsingFolder))],
    source:
      lock && lock.skills[skill.name] && typeof lock.skills[skill.name].source === "string"
        ? lock.skills[skill.name].source
        : null,
  }));

  return { skills, broken, folders, lockPath: lock ? lockPath : null };
}

// ── presentation ──────────────────────────────────────────────────

const VERSION = (() => {
  try {
    return require("./package.json").version;
  } catch {
    return "unknown";
  }
})();

// Tiny inline colour helper so the tool stays on a single dependency.
// Honours NO_COLOR (https://no-color.org) and never colours a redirected
// stream, so piped output stays clean.
const useColour =
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb" &&
  Boolean(process.stdout.isTTY);

const paint = (code) => (text) =>
  useColour ? `\u001B[${code}m${text}\u001B[0m` : String(text);

const bold = paint("1");
const dim = paint("2");
const green = paint("32");
const yellow = paint("33");
const cyan = paint("36");
const grey = paint("90");

// A pty that was never given a window size reports 0 columns, and the
// prompt library's box drawing collapses to one character per line when it
// believes the terminal has no width. Give it something sane to work with.
if (process.stdout.isTTY && !process.stdout.columns) {
  process.stdout.columns = 80;
}

// The prompt library hides the cursor while it draws. If the process dies
// between hide and restore, the user is left with an invisible cursor in
// their shell, so restore it unconditionally on the way out.
function restoreCursor() {
  if (process.stdout.isTTY) process.stdout.write("\u001B[?25h");
}

process.on("exit", restoreCursor);
process.on("SIGINT", () => {
  restoreCursor();
  process.exit(130);
});

function alignRows(rows) {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows
    .map(([label, value]) => `${grey(label.padEnd(width))}   ${value}`)
    .join("\n");
}

function tildePath(absolute) {
  const home = require("os").homedir();
  if (!home || !isInside(home, absolute)) return absolute;
  const rest = path.relative(home, absolute);
  return rest ? `~${path.sep}${rest}` : "~";
}

// Keeps the tail, which is the part that identifies the folder. A wrapped
// path turns the summary box into three ragged lines.
function shortenPath(absolute) {
  const text = tildePath(absolute);
  const max = Math.max(28, Math.min(60, (process.stdout.columns || 80) - 26));
  return text.length <= max ? text : `…${text.slice(text.length - (max - 1))}`;
}

// A short read of what already exists here, shown before the first question
// so the choice is made with the current state visible.
function describeWorkspace() {
  const rows = [];

  rows.push(["Project", bold(path.basename(projectRoot) || projectRoot)]);
  rows.push(["Location", dim(shortenPath(projectRoot))]);

  const templates = Object.keys(agentFiles);
  // `.agents/` alone proves nothing — `npx skills` creates it too. Only a
  // handoff folder, or a flat layout waiting to migrate, is a brain.
  if (isDirectory(handoffTarget) || hasLegacyLayout()) {
    // This renders before the prompt, so it has to count the flat layout too.
    // Reporting 0/15 for a brain that is complete but not yet migrated would
    // be actively misleading.
    const pending = hasLegacyLayout();
    const present = templates.filter(
      (relativePath) =>
        isRegularFile(handoffPath(relativePath)) ||
        isRegularFile(path.join(target, legacyFlatNames[relativePath])),
    ).length;

    const location = pending ? `${agentsDirName}/` : `${handoffLabel}/`;
    const suffix = pending ? dim(" · will migrate") : "";

    rows.push([
      "Brain",
      present === templates.length
        ? green(`${location} · ${present} files`) + suffix
        : yellow(`${location} · ${present}/${templates.length} files`) + suffix,
    ]);
  } else {
    rows.push(["Brain", dim("not set up yet")]);
  }

  const pointers = presentEnvironments().map((env) => env.fileName);
  rows.push(["Pointer", pointers.length ? green(pointers.join(" + ")) : dim("none")]);

  rows.push(["Skills", describeSkillsRow(discoverSkills())]);

  const agents = detectedAgents().map((agent) => agent.name);
  rows.push([
    "Agents",
    agents.length ? `${describeList(agents, 4)} ${dim("detected")}` : dim("none detected"),
  ]);

  const git = getGitInfo();
  rows.push([
    "Git",
    git
      ? git.inSubdirectory
        ? yellow(`subfolder of ${shortenPath(git.topDir)}`)
        : green("repository detected")
      : dim("no repository"),
  ]);

  return alignRows(rows);
}

function describeSkillsRow({ skills, broken }) {
  const parts = [];

  if (skills.length) {
    const names = describeList(
      skills.map((skill) => skill.name),
      3,
    );
    parts.push(`${green(`${skills.length} installed`)}${dim(` · ${names}`)}`);
  }

  if (broken.length) {
    parts.push(yellow(`${broken.length} broken link${broken.length === 1 ? "" : "s"}`));
  }

  return parts.length ? parts.join(dim(" · ")) : dim("none installed");
}

// ── UI ────────────────────────────────────────────────────────────

let interactive = true;

function environmentOptions() {
  const present = new Set(presentEnvironments().map((env) => env.id));
  const detected = detectedAgents();

  return pointerEnvironments.map((env) => {
    const detectedHere = agentsForEnvironment(env).filter((agent) => detected.includes(agent));

    // Keep the hint short: the option line is label + hint, and a line that
    // wraps stops reading as one option.
    const hints = [];
    if (present.has(env.id)) hints.push("current");
    if (detectedHere.length) {
      hints.push(
        `detected: ${describeList(
          detectedHere.map((agent) => agent.name),
          2,
        )}`,
      );
    }
    if (hints.length === 0) hints.push(env.summary);

    return {
      value: env.id,
      label: `${env.icon} ${env.label} — ${env.fileName}`,
      hint: hints.join(" · "),
    };
  });
}

// What the prompt opens with. An existing project shows what it has; a fresh
// one follows the agents detected on this machine, the way skills picks its
// install targets. Universal is the fallback so the prompt never opens empty.
function initialEnvironmentIds() {
  const present = presentEnvironments().map((env) => env.id);
  if (present.length) return present;

  const detected = detectedAgents();
  const ids = pointerEnvironments
    .filter((env) => agentsForEnvironment(env).some((agent) => detected.includes(agent)))
    .map((env) => env.id);

  return ids.length ? ids : [defaultEnvironment.id];
}

async function chooseEnvironments(message) {
  const ids = await multiselect({
    message: `${message} ${dim("(space toggles · enter confirms)")}`,
    options: environmentOptions(),
    initialValues: initialEnvironmentIds(),
    required: true,
  });

  if (isCancel(ids)) return null;
  return pointerEnvironments.filter((env) => ids.includes(env.id));
}

async function selectAction() {
  if (isHandoffPopulated()) {
    const choice = await select({
      message: "This project already has a brain. What do you want to do?",
      options: [
        {
          value: "switch",
          label: "\u{1F504} Switch environment",
          hint: "keep the brain · choose the pointer files",
        },
        {
          value: "reinit",
          label: `\u{1F535} Reinitialise ${handoffLabel}/`,
          hint: "archive the current brain · start from fresh templates",
        },
      ],
      initialValue: "switch",
    });

    if (isCancel(choice)) return null;
    if (choice === "reinit") return { action: "reinit" };
  }

  const environments = await chooseEnvironments(
    presentEnvironments().length
      ? "Which environments should have a pointer file?"
      : "Which environments do you want to set up?",
  );
  if (environments === null) return null;

  return { action: "setup", environments };
}

async function confirmReinit() {
  const proceed = await confirm({
    message: `Proceed? The active brain moves into ${handoffLabel}/${archiveDirName}/ and is replaced with fresh templates. Nothing outside ${handoffLabel}/ is touched, including ${skillsDirName}/.`,
    initialValue: true,
  });
  return isCancel(proceed) ? null : proceed;
}

function bail(message) {
  if (interactive) {
    cancel(message);
  } else {
    console.log(`${grey(`[agent-sesh v${VERSION}]`)} ${message}`);
  }
  process.exit(130);
}

// Each line has to fit the note box on its own. clack wraps on width but does
// not indent the continuation, so an overlong step folds back to the left
// margin and stops reading as a numbered list. Keep every line short.
function nextSteps(fileNames) {
  const tags = fileNames.map((name) => `@${name}`);
  const others = tags.slice(1);
  const alternatives =
    others.length === 0
      ? ""
      : others.length === 1
        ? ` ${dim(`(or ${others[0]})`)}`
        : ` ${dim(`(or ${others[0]} +${others.length - 1} more)`)}`;

  return [
    `${cyan("1")}  Start your AI session with ${bold(tags[0])}${alternatives}`,
    `${cyan("2")}  Fill in ${bold(`${handoffLabel}/${referencesDirName}/overview.md`)}`,
    `${cyan("3")}  Keep ${bold(`${handoffLabel}/${memoryDirName}/`)} current as you work`,
    `${cyan("4")}  Ask the AI to update ${bold(`${handoffLabel}/`)} before you finish`,
  ].join("\n");
}

// The full registry, grouped by the pointer file each agent reads. This is
// the answer to "does agent-sesh support my agent?" — and the same list
// `npx skills` installs to, so the two tools can be checked against each other.
function describeAgents() {
  const detected = detectedAgents();
  const visible = agentRegistry.filter((agent) => !agent.hidden);
  const lines = [
    `${bold("agent-sesh")} ${grey(`v${VERSION}`)} — ${visible.length} supported agents, mirrored from vercel-labs/skills`,
    "",
  ];

  for (const env of pointerEnvironments) {
    const agents = agentsForEnvironment(env).sort((a, b) => a.name.localeCompare(b.name));
    const blurb =
      env.id === defaultEnvironment.id
        ? "the open standard — the pointer for every agent without a file of its own"
        : env.summary;
    lines.push(`${bold(env.fileName)}  ${grey(env.flag)}  ${dim(blurb)}`);

    const width = Math.max(...agents.map((agent) => agent.name.length));
    for (const agent of agents) {
      const mark = detected.includes(agent) ? green("  detected") : "";
      lines.push(`  ${agent.name.padEnd(width)}   ${dim(`${agent.skillsDir}/`)}${mark}`);
    }
    lines.push("");
  }

  lines.push(
    `The right-hand column is where ${bold("npx skills add")} installs for that agent.`,
    `agent-sesh never writes there; it only reports what is installed.`,
  );

  return lines.join("\n");
}

// ── main ──────────────────────────────────────────────────────────

const HELP_TEXT = [
  `${bold("agent-sesh")} ${grey(`v${VERSION}`)} — stateful AI coding sessions`,
  "",
  bold("Usage"),
  "  npx agent-sesh [options]",
  "",
  `${bold("Environments")}  ${grey("flags combine: --uni --claude writes both pointer files")}`,
  ...pointerEnvironments.map((env) => {
    const detail =
      env.id === defaultEnvironment.id
        ? `${env.label} — ${env.fileName} (Codex, Cursor, Copilot, OpenCode…)`
        : `${env.label} — ${env.fileName}`;
    return `  ${env.flag.padEnd(15)} ${detail}`;
  }),
  "",
  bold("Other"),
  "  --agents        List every supported agent and the pointer file it reads",
  "  -v, --version   Print the version and exit",
  "  -h, --help      Show this help",
  "",
  `${bold("Run with no options")} for the interactive setup.`,
  "",
].join("\n");

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    return;
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(VERSION);
    return;
  }

  if (args.includes("--agents")) {
    console.log(describeAgents());
    return;
  }

  const knownFlags = pointerEnvironments.map((env) => env.flag);
  const unknown = args.filter((arg) => !knownFlags.includes(arg));

  if (unknown.length > 0) {
    console.error(`\n  ✖  Unrecognised argument: ${unknown.join(" ")}\n`);
    console.error(
      `  ℹ  Usage: npx agent-sesh [${knownFlags.join(" | ")} | --agents | --version | --help]\n`,
    );
    process.exit(1);
  }

  const flagged = pointerEnvironments.filter((env) => args.includes(env.flag));

  // isTTY is a predicate taking a stream, not a boolean. Treating it as a
  // boolean made this check dead code, so a non-interactive run rendered a
  // prompt into a stream nobody was reading, created nothing, and exited 0.
  const hasTTY = isTTY(process.stdin) && isTTY(process.stdout);
  interactive = flagged.length === 0 && hasTTY;

  const tag = grey(`[agent-sesh v${VERSION}]`);
  const describeEnvironments = (envs) =>
    joinNames(envs.map((env) => `${env.label} (${env.fileName})`));

  let selected = null;
  let reinit = false;

  if (flagged.length > 0) {
    selected = flagged;
    console.log(`${tag} Setting up ${describeEnvironments(selected)}…`);
  } else if (!hasTTY) {
    selected = [defaultEnvironment];
    const otherFlags = pointerEnvironments.slice(1).map((env) => env.flag);
    console.log(
      `${tag} No interactive terminal detected — defaulting to ${describeEnvironments(selected)}. ` +
        `Pass ${joinNames(otherFlags)} for other agents; flags combine.`,
    );
  } else {
    intro(`${bold("\u{1F9E0} agent-sesh")}  ${grey(`v${VERSION}`)}`);
    note(describeWorkspace(), "Workspace");
    const choice = await selectAction();
    if (choice === null) bail("Cancelled.");
    if (choice.action === "reinit") reinit = true;
    else selected = choice.environments;
  }

  const warnings = [];
  const infoNotes = [];
  let archivedBrain = null;

  if (reinit) {
    // A brain reset changes .agents/handoff/, not the root instructions: every
    // pointer already here stays. Only a project with none at all is asked.
    selected = presentEnvironments();
    if (selected.length === 0) {
      selected = await chooseEnvironments("Which environments do you want to set up?");
      if (selected === null) bail("Cancelled.");
    }

    // Read-only, and it throws for a pointer that is not a regular file or
    // cannot be read — better before the confirmation than after the archive.
    readPointerFiles();

    const proceed = await confirmReinit();
    if (proceed === null) bail("Cancelled.");

    if (!proceed) {
      outro(`${yellow("Reinit cancelled.")} Nothing was changed.`);
      return;
    }

    archivedBrain = archiveAndReinitializeAgentsDirectory();
    log.step(
      `Archived ${bold(String(archivedBrain.itemCount))} active item(s) as ${bold(`${archiveDirName}/${archivedBrain.name}/`)}`,
    );
  }

  // Counted before and after, so the summary's "preserved" is a measurement
  // rather than a promise.
  const skillsBefore = discoverSkills();

  // Every question is asked before anything is written, so the run is
  // "answer, then watch it work" rather than being interrupted afterwards.
  const repositoryWarning = await ensureGitRepository();

  const progress = interactive ? spinner() : null;
  if (progress) progress.start("Building the project brain");

  let created;
  let existing;
  let total;
  let pointers;
  let protection;
  let hooks;
  let migration = archivedBrain ? archivedBrain.migration : null;

  try {
    // Both writes happen here, after every question has been asked. The reinit
    // path above already migrated, so this call is a no-op in that case.
    if (!migration) migration = migrateToHandoffLayout();
    if (migration) warnings.push(...migration.warnings);

    ({ created, existing, total } = ensureAgentsDirectory());
    warnings.push(...migrateRootBackups());

    pointers = reconcilePointers(selected, { keepExisting: Boolean(archivedBrain) });
    protection = selected.map((env) => ({ env, status: protectFile(pointerPath(env)) }));

    if (backupWasWritten) {
      ensureBackupReadme();
    }

    hooks = installGitHooks();
  } catch (err) {
    if (progress) progress.stop("Setup failed", 1);
    throw err;
  }

  if (progress) progress.stop(`Project brain ready in ${bold(`${handoffLabel}/`)}`);

  if (repositoryWarning) warnings.push(repositoryWarning);
  warnings.push(...hooks.warnings);
  infoNotes.push(...hooks.notes);

  const fileNames = selected.map((env) => env.fileName);

  for (const { kept, retired, backupName } of pointers.conflicts) {
    infoNotes.push(
      [
        `Both ${kept.fileName} and ${retired.fileName} had custom content.`,
        `Kept ${bold(kept.fileName)} unchanged; ${retired.fileName} was saved as ${bold(backupName)}.`,
      ].join("\n"),
    );
  }

  if (pointers.divergent.length > 0) {
    const names = joinNames([
      pointers.source.fileName,
      ...pointers.divergent.map((env) => env.fileName),
    ]);
    infoNotes.push(
      [
        `${names} are all customised, and they differ.`,
        "All were kept as they are — check that they agree.",
      ].join("\n"),
    );
  }

  const unprotected = protection.filter((entry) => entry.status !== "read-only");

  const summaryRows = [
    [`${handoffLabel}/`, getAgentsDirectoryStatus(created, existing, total)],
    ...pointers.results.map(({ env, status }) => [env.fileName, getAgentsFileStatus(status)]),
    [
      "protection",
      unprotected.length === 0
        ? green("read-only")
        : yellow(unprotected.map((entry) => `${entry.env.fileName}: ${entry.status}`).join(", ")),
    ],
    [
      "git hooks",
      hooks.installed.length
        ? green(hooks.installed.join(", "))
        : dim("not installed"),
    ],
  ];

  if (skillsBefore.skills.length > 0 || skillsBefore.broken.length > 0) {
    const skillsAfter = discoverSkills();
    const before = skillsBefore.skills.length;
    const after = skillsAfter.skills.length;
    summaryRows.push([
      "skills",
      before === after
        ? green(`${after} preserved`)
        : yellow(`${before} before, ${after} after — please report this`),
    ]);
  }

  if (migration && migration.moved > 0) {
    summaryRows.push([
      "migrated",
      `${migration.moved} item(s) moved in`,
    ]);
    // Short lines: clack prints a note as-is, so anything past the terminal
    // width soft-wraps mid-path.
    const migrationNote = [
      `Moved the existing project brain into ${bold(`${handoffLabel}/`)},`,
      `sorted into ${memoryDirName}/, ${rulesDirName}/ and ${referencesDirName}/.`,
    ];

    // Only the flat migration takes a snapshot. Folding an interim layout
    // forward never leaves handoff/, so there is nothing to point at.
    if (migration.snapshot) {
      migrationNote.push(
        "A copy of the previous layout is in",
        `  ${bold(migration.snapshot.relativePath)}`,
        `Everything else in ${agentsDirName}/ was left alone.`,
      );
    }

    infoNotes.push(migrationNote.join("\n"));
  }

  if (archivedBrain) {
    summaryRows.push([
      "archive",
      `${archiveDirName}/${archivedBrain.name}/ (${archivedBrain.pathCount} paths)`,
    ]);
  }

  // Migrating rewrites the pointer because every path inside it moved. A user
  // who had customised theirs would otherwise just see it replaced, with the
  // reason left implicit and their own wording only in a backup file.
  const rewritten = pointers.results.filter(({ status }) => isBackupStatus(status));
  if (migration && migration.moved > 0 && rewritten.length > 0) {
    for (const { env, status } of rewritten) {
      infoNotes.push(
        [
          `${env.fileName} had custom content and was rewritten:`,
          `the paths inside it moved into ${handoffLabel}/.`,
          `Your version is kept as ${bold(status)} — re-apply what you still want.`,
        ].join("\n"),
      );
    }
  }

  for (const { env, backupName } of pointers.backups) {
    summaryRows.push([
      "backup",
      `${backupDirName}/${backupSubdirName(env.fileName)}/${backupName}`,
    ]);
  }

  // A pointer that left without a backup row still left; say so.
  for (const { env, outcome } of pointers.retired) {
    if (outcome.action === "discarded") {
      summaryRows.push(["retired", `${env.fileName} ${dim("(unmodified template, removed)")}`]);
    } else if (outcome.action === "already-backed-up") {
      summaryRows.push(["retired", `${env.fileName} ${dim("(identical backup exists, removed)")}`]);
    } else if (outcome.action === "kept") {
      summaryRows.push(["retired", `${env.fileName} ${yellow("left in place (could not be read)")}`]);
    }
  }

  // One line, and it has to fit: three or more names are counted instead of
  // listed — the summary rows above already name each one.
  const pointerSummary =
    fileNames.length === 1
      ? `${bold(fileNames[0])} now points agents at ${handoffLabel}/`
      : fileNames.length === 2
        ? `${bold(joinNames(fileNames))} now point agents at ${handoffLabel}/`
        : `${bold(`${fileNames.length} pointer files`)} now point agents at ${handoffLabel}/`;

  if (interactive) {
    note(alignRows(summaryRows), "Summary");

    for (const message of infoNotes) {
      log.info(message);
    }

    for (const message of warnings) {
      log.warn(message);
    }

    note(nextSteps(fileNames), "Next steps");
    outro(`${green("Done")} — ${pointerSummary}`);
  } else {
    console.log(`${tag} Project brain ready ✅`);
    console.log("");
    console.log(alignRows(summaryRows.map(([k, v]) => [`  ${k}`, v])));

    for (const message of [...infoNotes, ...warnings]) {
      console.log("");
      console.log(message);
    }

    console.log("");
    console.log(`  ${pointerSummary}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    restoreCursor();
    console.error(`\n  ✖  ${err.message}\n`);
    process.exit(1);
  });
} else {
  // For the test suite. The CLI is the product; these are the seams it checks.
  module.exports = {
    agentRegistry,
    pointerEnvironments,
    canonicalSkillsDir,
    skillsLockFileName,
    isOwnedPath,
    parseSkillFrontmatter,
    discoverSkills,
    detectedAgents,
    isDefaultTemplate,
    getTemplateContent,
    legacyPointerTemplates,
    legacyLayoutMap,
    interimLayoutMap,
    agentFiles,
  };
}
