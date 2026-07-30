#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const {
  intro,
  outro,
  select,
  confirm,
  note,
  log,
  spinner,
  cancel,
  isCancel,
  isTTY,
} = require("@clack/prompts");

const projectRoot = process.cwd();
const agentsDirName = ".agents";
const target = path.join(projectRoot, agentsDirName);
const agentsFile = path.join(projectRoot, "AGENTS.md");
const claudeFile = path.join(projectRoot, "CLAUDE.md");

const agentFiles = {
  "README.md": `# .agents

This folder is the project brain for AI agents working in this repository.

## Required Agent Workflow

1. Read this file first.
2. Read every other file in this folder before changing code.
3. Keep the relevant files updated as work progresses.
4. Before ending a session, update state.md, tasks.md, and last-session.md.

## Files

- state.md: current implementation status and system shape.
- pipeline.md: how work and data flow through the system end to end.
- tasks.md: next actionable tasks.
- last-session.md: handoff notes from the most recent session.
- decisions.md: settled technical decisions and tradeoffs.
- context.md: project intent, goals, and non-goals.
- assumptions.md: what is being taken as true, and what still needs verification.
- style.md: coding and writing style preferences.
- roadmap.md: near-future direction.
- constraints.md: hard rules and limits.
- bugs.md: active defects that can be fixed within the current foundational technology.
- known-issues.md: foundational technology limits that require replacement or architectural change to resolve.
- glossary.md: project-specific terms.
- commands.md: project-specific command reference.
`,
  "state.md": `# State

Describe how the project works right now. Keep this present-tense and accurate. Include runtime behavior, important components, and data flow here.

## Current State

## Implemented

## Missing Or Partial

## Invariants

<!-- End-to-end flow belongs in pipeline.md, not here. -->
`,
  "pipeline.md": `# Pipeline

Describe how work and data actually move through the system, end to end. Follow one real path rather than listing components.

## Entry Points

## Stages

## Data Flow

## Side Effects

## Failure Modes And Recovery
`,
  "tasks.md": `# Tasks

Track current actionable work. Keep this scoped and ordered.

## Now

## Next

## Done
`,
  "last-session.md": `# Last Session

Write a clear handoff for the next agent.

## Summary

## Changed

## Tried But Did Not Finish

## Next Steps
`,
  "decisions.md": `# Decisions

Record settled decisions and the reasoning behind them.

## Active Decisions

## Rejected Options

## Revisit Later
`,
  "context.md": `# Context

Explain why this project exists and what it is trying to achieve.

## Goal

## Non-Goals

## Users

## Background

<!-- What you are taking as true belongs in assumptions.md, not here. -->
`,
  "assumptions.md": `# Assumptions

Record what this project takes as true but has not proven. An assumption written down can be challenged; an unwritten one silently breaks things.

## Active Assumptions

## Needs Verification

## Invalidated
`,
  "roadmap.md": `# Roadmap

Describe the near-future direction without turning this into a backlog dump.

## Planned

## Later

## Explicitly Postponed
`,
  "style.md": `# Style

Document coding, naming, file organization, tooling, and communication preferences.

## Code Style

## File Organization

## Naming

## Preferred Tools

## Preferred Patterns

## Communication
`,
  "constraints.md": `# Constraints

Document hard rules, platform limits, security requirements, and other boundaries.

## Hard Rules

## Technical Limits

## Security And Privacy

## Dependencies
`,
  "bugs.md": `# Bugs

This is the active queue for observed or suspected defects that can be fixed within the project's current foundational technology. These problems require investigation, repair, and verification.

> **Agent rule:** Every current bug is unresolved work. Keep it visible and give it a concrete Next action until a fix is verified. Never close or reclassify a bug merely because it is difficult, low priority, or has a workaround.

## File Boundary

- Foundational technology means the core database, auth provider, framework or runtime, infrastructure platform, protocol, or fundamental algorithmic approach on which the project is built.
- Keep a problem here when it can be fixed through code, configuration, schemas, integrations, or supported upgrades without replacing that foundation.
- Difficulty does not determine the file. An extra-hard defect remains a bug if the current foundation can support a correct implementation.
- Move a problem to known-issues.md only when evidence shows that a correct fix requires replacing or re-architecting foundational technology. Carry over the evidence and identify the required foundational change.
- A workaround reduces impact but does not resolve or close a bug.
- After a fix is verified, move the entry to Fixed Bugs. Do not mark a bug fixed based only on a code change.
- When a bug is part of the current work plan, tasks.md may reference its bug ID instead of duplicating its details.

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
  "known-issues.md": `# Known Issues

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
  "glossary.md": `# Glossary

Define project-specific terms and domain language.

## Terms

## Acronyms

## Ambiguous Words
`,
  "commands.md": `# Project Commands

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

This project uses \`${agentsDirName}/\` as its agent memory and handoff folder.

IMPORTANT: Do not edit this AGENTS.md file for project memory, state, tasks, decisions, or handoff notes. This file is only a pointer. Put all project memory updates in \`${agentsDirName}/\`.

Before making changes:
1. Read \`${agentsDirName}/README.md\`.
2. Read every file in \`${agentsDirName}/\`.
3. Treat \`${agentsDirName}/state.md\`, \`${agentsDirName}/tasks.md\`, and \`${agentsDirName}/last-session.md\` as the primary session state.
4. Keep the relevant files in \`${agentsDirName}/\` updated before ending the session.

Do not skip the \`${agentsDirName}/\` files. Do not write session state into AGENTS.md. The \`${agentsDirName}/\` folder is the source of truth for agent context in this project.
`;

const oldAgentFilesReadme = `# Old Agent Files

This folder contains backups of previous AGENTS.md and CLAUDE.md pointer files.

Backups are only created when the pointer file contained **custom user content**
(i.e., content that differs from the default agent-sesh template). Default
template content is never backed up.

## Structure

\`\`\`
old_agent_files/
├── README.md          ← this file
├── agents/
│   ├── README.md      ← symlink to ../README.md
│   ├── OLD_AGENTS_1.md
│   └── OLD_AGENTS_2.md
└── claude/
    ├── README.md      ← symlink to ../README.md
    ├── OLD_CLAUDE_1.md
    └── OLD_CLAUDE_2.md
\`\`\`

## Naming Scheme

- Files are named \`OLD_{AGENTS|CLAUDE}_N.md\` where N is a sequential number.
- **Numbering is the order the backups were taken**: \`_1\` is the oldest, and
  the highest number is the most recent. Existing backups are never renumbered.
- Files are **deduplicated by content**: a pointer file whose content already
  matches a stored backup is discarded instead of backed up again.

## When Backups Are Created

- Running \`agent-sesh\` when the existing pointer file has custom content that
  differs from the default template.
- Switching environments (e.g., from AGENTS.md to CLAUDE.md) when the pointer
  file has been customized.
- When both AGENTS.md and CLAUDE.md exist with different custom content: the
  file you are switching **to** is kept as-is, and the other one is backed up.

Backups are **not** created when:
- The pointer file matches the default agent-sesh template (either variant).
- An identical backup already exists.

Nothing here is ever deleted to make room for a new backup, and a file that
cannot be read is left where it is rather than being discarded.
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

function isAgentsDirectoryPopulated() {
  if (!isDirectory(target)) return false;
  const entries = fs.readdirSync(target);
  const meaningful = entries.filter(
    (e) => e !== "old_agent_files" && e !== "custom",
  );
  return meaningful.length > 0;
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

  const topDir = path.resolve(top);

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
    inSubdirectory: path.resolve(projectRoot) !== topDir,
  };
  return gitInfoCache;
}

// ── process helpers ───────────────────────────────────────────────

function canPromptForElevation() {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
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
// immutability (chattr +i, chflags schg/uchg, deny-delete ACLs) is never
// applied — it made the pointer file undeletable by git itself, which broke
// pull/merge/checkout. The `unlock*` helpers below exist purely to strip
// those flags off files created by versions <= 1.0.6.

function makeReadOnly(filePath) {
  let ok = true;

  try {
    fs.chmodSync(filePath, 0o444);
  } catch {
    ok = false;
  }

  if (process.platform === "win32") {
    ok = runQuiet("attrib", ["+R", filePath]) && ok;
  }

  return ok;
}

function makeWritable(filePath) {
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

function runPowerShell(script, filePath) {
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
    filePath,
  ];

  return runQuiet("powershell.exe", args) || runQuiet("pwsh", args);
}

function unlockWindowsFile(filePath) {
  if (process.platform !== "win32") {
    return;
  }

  const script = `
param([string]$Path)
$item = Get-Item -LiteralPath $Path -Force
$item.IsReadOnly = $false
$acl = Get-Acl -LiteralPath $Path
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$rules = @($acl.Access | Where-Object {
  $_.IdentityReference.Value -eq $identity -and
  $_.AccessControlType -eq "Deny" -and
  (($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Write) -or
   ($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Delete))
})
foreach ($rule in $rules) { [void]$acl.RemoveAccessRule($rule) }
Set-Acl -LiteralPath $Path -AclObject $acl
`;

  runPowerShell(script, filePath);
}

// Legacy-only, and deliberately lazy: this spawns lsattr / stat / PowerShell,
// and on Windows a PowerShell cold start costs about a second. It runs only
// after a normal filesystem operation has already failed, so a run that has
// no legacy flags to strip never pays for it.
function unlockFileDeep(filePath) {
  unlockLinuxImmutable(filePath);
  unlockMacImmutable(filePath);
  unlockWindowsFile(filePath);
  makeWritable(filePath);
}

function withUnlockRetry(filePath, action) {
  try {
    return action();
  } catch (err) {
    if (!fs.existsSync(filePath)) throw err;
    unlockFileDeep(filePath);
    return action();
  }
}

function writeFileSafe(filePath, content) {
  withUnlockRetry(filePath, () => {
    if (fs.existsSync(filePath)) makeWritable(filePath);
    fs.writeFileSync(filePath, content);
  });
}

function removeFileSafe(filePath) {
  withUnlockRetry(filePath, () => {
    fs.unlinkSync(filePath);
  });
}

function moveFileSafe(srcPath, dstPath) {
  withUnlockRetry(srcPath, () => {
    fs.renameSync(srcPath, dstPath);
  });
}

function protectFile(filePath) {
  return makeReadOnly(filePath) ? "read-only" : "NOT APPLIED (permission denied)";
}

function getTemplateContent(fileName) {
  return agentsFileContent.replace(/AGENTS\.md/g, fileName);
}

function isDefaultTemplate(content) {
  return (
    content === getTemplateContent("AGENTS.md") ||
    content === getTemplateContent("CLAUDE.md")
  );
}

// ── backups ───────────────────────────────────────────────────────

let backupWasWritten = false;

function getBackupDir(fileName, { create = false } = {}) {
  const subdir = fileName === "CLAUDE.md" ? "claude" : "agents";
  const dir = path.join(target, "old_agent_files", subdir);
  if (create) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function backupBaseName(fileName) {
  return fileName === "CLAUDE.md" ? "CLAUDE" : "AGENTS";
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
      if (fs.readFileSync(backup.path, "utf8") === content) return backup.path;
    } catch {
      // Unreadable backup: cannot compare, so assume it is not a match.
    }
  }
  return null;
}

function getAvailableBackupPath(fileName) {
  const dir = getBackupDir(fileName, { create: true });
  const base = backupBaseName(fileName);
  const used = new Set(listBackups(fileName).map((b) => b.index));

  let index = 1;
  while (used.has(index) || fs.existsSync(path.join(dir, `OLD_${base}_${index}.md`))) {
    index += 1;
  }

  return path.join(dir, `OLD_${base}_${index}.md`);
}

function ensureBackupReadme() {
  const oldAgentFilesDir = path.join(target, "old_agent_files");
  fs.mkdirSync(oldAgentFilesDir, { recursive: true });

  const readmePath = path.join(oldAgentFilesDir, "README.md");

  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, oldAgentFilesReadme);
  } else if (fs.readFileSync(readmePath, "utf8") !== oldAgentFilesReadme) {
    writeFileSafe(readmePath, oldAgentFilesReadme);
  }

  makeReadOnly(readmePath);

  for (const subdir of ["claude", "agents"]) {
    const subdirPath = path.join(oldAgentFilesDir, subdir);
    fs.mkdirSync(subdirPath, { recursive: true });
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
        fs.unlinkSync(linkPath);
      }
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
// root. Fold any stragglers into .agents/old_agent_files/.
//
// The previous implementation deleted every backup it could see and then
// rewrote the survivors from memory, which permanently destroyed any backup
// that happened to be unreadable, and lost the lot if a write failed midway.
// This version writes the destination first and only then removes the
// source, and never touches a file it could not read.
function migrateRootBackups() {
  const types = [
    { pattern: /^OLD_CLAUDE_\d+\.md$/, name: "CLAUDE.md" },
    { pattern: /^OLD_AGENTS_\d+\.md$/, name: "AGENTS.md" },
  ];

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
        fs.writeFileSync(destPath, content);
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
      "A .agents path already exists here, but it is not a folder. Move it aside and re-run agent-sesh.",
    );
  }

  fs.mkdirSync(target, { recursive: true });

  let created = 0;
  let existing = 0;

  for (const [fileName, content] of Object.entries(agentFiles)) {
    const filePath = path.join(target, fileName);

    if (fs.existsSync(filePath)) {
      existing += 1;
      continue;
    }

    fs.writeFileSync(filePath, content);
    created += 1;
  }

  return { created, existing, total: Object.keys(agentFiles).length };
}

function uniqueDestination(dir, entry) {
  const ext = path.extname(entry);
  const stem = ext ? entry.slice(0, -ext.length) : entry;

  let candidate = path.join(dir, entry);
  let suffix = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem}-${suffix}${ext}`);
    suffix += 1;
  }

  return candidate;
}

function reinitAgentsDirectory() {
  const standardFiles = new Set(Object.keys(agentFiles));
  const reservedDirs = new Set(["old_agent_files", "custom"]);
  const customDir = path.join(target, "custom");

  const moved = [];
  const warnings = [];
  let customDirReady = false;

  for (const entry of fs.readdirSync(target)) {
    if (standardFiles.has(entry) || reservedDirs.has(entry)) continue;

    // Created lazily so a reinit with nothing to move leaves no empty
    // custom/ folder behind.
    if (!customDirReady) {
      fs.mkdirSync(customDir, { recursive: true });
      customDirReady = true;
    }

    const srcPath = path.join(target, entry);
    // renameSync silently replaces an existing destination, so a second
    // reinit used to overwrite the first reinit's copy of the same filename.
    const dstPath = uniqueDestination(customDir, entry);

    try {
      moveFileSafe(srcPath, dstPath);
      moved.push(path.basename(dstPath));
    } catch (err) {
      warnings.push(`Could not move ${entry}: ${err.message}`);
    }
  }

  return { moved, warnings };
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

  if (existing === content) return "unchanged";

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

// Decides what the pointer file should end up containing when switching
// environments, without ever discarding hand-written content.
function retargetPointerFile(targetFile, targetName, otherFile, otherName) {
  if (!isRegularFile(otherFile)) {
    return { status: ensureAgentsFile(targetFile, targetName) };
  }

  let otherContent;
  try {
    otherContent = fs.readFileSync(otherFile, "utf8");
  } catch (err) {
    throw new Error(
      `Cannot read ${otherName} (${err.message}). Fix its permissions and re-run agent-sesh.`,
    );
  }

  let targetContent = null;
  if (isRegularFile(targetFile)) {
    try {
      targetContent = fs.readFileSync(targetFile, "utf8");
    } catch (err) {
      throw new Error(
        `Cannot read ${targetName} (${err.message}). Fix its permissions and re-run agent-sesh.`,
      );
    }
  }

  // Rewrite references so the mirrored file talks about itself. Copying the
  // bytes verbatim left CLAUDE.md saying "Do not edit this AGENTS.md file",
  // which is exactly the instruction that stops an agent overwriting it.
  const mirrored = otherContent.split(otherName).join(targetName);

  const otherIsCustom = !isDefaultTemplate(otherContent);
  const targetIsCustom =
    targetContent !== null &&
    !isDefaultTemplate(targetContent) &&
    targetContent !== mirrored;

  if (otherIsCustom && targetIsCustom) {
    // Both are hand-written and they differ. Keep the file the user is
    // switching *to* and archive the other one.
    const retired = retirePointerFile(otherFile, otherName);
    return {
      status: "kept existing",
      conflict: { otherName, retired },
    };
  }

  if (otherIsCustom) {
    // Carry the customisations across, then archive the original so the
    // untouched bytes stay recoverable.
    writeFileSafe(targetFile, mirrored);
    const retired = retirePointerFile(otherFile, otherName);
    return { status: `migrated from ${otherName}`, retired };
  }

  // The other file is just a stock template — nothing worth carrying over.
  const retired = retirePointerFile(otherFile, otherName);
  const status = ensureAgentsFile(targetFile, targetName);
  return { status, retired };
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
  const quoted = ["AGENTS.md", "CLAUDE.md"]
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
    fs.writeFileSync(hookPath, `#!/bin/sh\n${block}\n`);
    finish();
    return "installed";
  }

  const source = fs.readFileSync(hookPath, "utf8");
  const withoutOurs = stripHookBlock(source);

  if (withoutOurs !== null) {
    const rebuilt = `${withoutOurs.replace(/\s*$/, "")}\n${block}\n`;
    if (rebuilt !== source) fs.writeFileSync(hookPath, rebuilt);
    finish();
    return "updated";
  }

  if (!isShellScript(source)) {
    return "foreign";
  }

  fs.writeFileSync(hookPath, `${source.replace(/\s*$/, "")}\n\n${block}\n`);
  finish();
  return "appended";
}

const NO_REPOSITORY_WARNING = [
  "No git repository here, so the protection hooks were not installed.",
  "",
  "Without them, AGENTS.md / CLAUDE.md lose their read-only flag whenever",
  "git replaces the file (pull, merge, checkout). Nothing else breaks —",
  "run `git init` and then agent-sesh again to install them.",
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
      `Files were created in this folder, but the git repository root is ${git.topDir}.\nHooks were installed on that repository.`,
    );
  }

  if (git.usesCustomHooksPath) {
    notes.push(`This repository sets core.hooksPath, so hooks were installed in ${git.hooksDir}.`);
  }

  try {
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
      `Existing ${appended.join(" and ")} hook${appended.length > 1 ? "s were" : " was"} kept; the agent-sesh block was appended.`,
    );
  }

  if (foreign.length) {
    warnings.push(
      [
        `Left the existing ${foreign.join(" and ")} hook${foreign.length > 1 ? "s" : ""} untouched.`,
        "",
        "The file is not a shell script, so the protection block was not added.",
        "Add this to it by hand if you want protection re-applied after git operations:",
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
  return home && absolute.startsWith(home)
    ? `~${absolute.slice(home.length)}`
    : absolute;
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
  if (isDirectory(target)) {
    const present = fs
      .readdirSync(target)
      .filter((entry) => templates.includes(entry)).length;
    rows.push([
      "Brain",
      present === templates.length
        ? green(`.agents/ · ${present} files`)
        : yellow(`.agents/ · ${present}/${templates.length} files`),
    ]);
  } else {
    rows.push(["Brain", dim("not set up yet")]);
  }

  const hasAgents = isRegularFile(agentsFile);
  const hasClaude = isRegularFile(claudeFile);
  rows.push([
    "Pointer",
    hasAgents && hasClaude
      ? yellow("AGENTS.md + CLAUDE.md")
      : hasAgents
        ? green("AGENTS.md")
        : hasClaude
          ? green("CLAUDE.md")
          : dim("none"),
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

// ── UI ────────────────────────────────────────────────────────────

let interactive = true;

function environmentOptions() {
  const hasAgents = isRegularFile(agentsFile);
  const hasClaude = isRegularFile(claudeFile);

  return [
    {
      value: "universal",
      label: "\u{1F7E2} Universal — AGENTS.md",
      hint: hasAgents
        ? "current · Codex, Cursor, Windsurf…"
        : "Codex, Cursor, Windsurf…",
    },
    {
      value: "claude",
      label: "\u{1F7E0} Claude Code — CLAUDE.md",
      hint: hasClaude ? "current" : "Anthropic Claude Code",
    },
  ];
}

async function chooseEnvironment(isSwitch) {
  const env = await select({
    message: isSwitch
      ? "Which environment do you want to switch to?"
      : "Which environment do you want to set up?",
    options: environmentOptions(),
    initialValue: isRegularFile(claudeFile) ? "claude" : "universal",
  });
  return isCancel(env) ? null : env;
}

async function selectEnvironment() {
  const isSwitch =
    isDirectory(target) && (isRegularFile(agentsFile) || isRegularFile(claudeFile));

  if (isAgentsDirectoryPopulated()) {
    const shouldReinit = await select({
      message: "This project already has a brain. What do you want to do?",
      options: [
        {
          value: "no",
          label: "\u{1F504} Switch environment",
          hint: "keep everything, just change the pointer file",
        },
        {
          value: "yes",
          label: "\u{1F535} Reinitialise .agents/",
          hint: "restore the standard layout · your content is preserved",
        },
      ],
      initialValue: "no",
    });

    if (isCancel(shouldReinit)) return null;
    if (shouldReinit === "yes") return "reinit";
  }

  return chooseEnvironment(isSwitch);
}

async function confirmReinit() {
  const proceed = await confirm({
    message:
      "Proceed? Custom files and folders in .agents/ move to .agents/custom/",
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

function nextSteps(targetName) {
  return [
    `${cyan("1")}  Start your AI session with ${bold(`@${targetName}`)}`,
    `${cyan("2")}  Fill in ${bold(".agents/context.md")} and ${bold(".agents/state.md")}`,
    `${cyan("3")}  Ask the AI to update ${bold(".agents/")} before the session ends`,
  ].join("\n");
}

// ── main ──────────────────────────────────────────────────────────

const HELP_TEXT = `${bold("agent-sesh")} ${grey(`v${VERSION}`)} — stateful AI coding sessions

${bold("Usage")}
  npx agent-sesh [options]

${bold("Options")}
  --uni           Set up / switch to Universal (AGENTS.md) — Codex, Cursor, Windsurf…
  --claude        Set up / switch to Claude Code (CLAUDE.md)
  -v, --version   Print the version and exit
  -h, --help      Show this help

${bold("Run with no options")} for the interactive setup.
`;

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

  const knownFlags = new Set(["--uni", "--claude"]);
  const unknown = args.filter((arg) => !knownFlags.has(arg));

  if (unknown.length > 0) {
    console.error(`\n  ✖  Unrecognised argument: ${unknown.join(" ")}\n`);
    console.error(`  ℹ  Usage: npx agent-sesh [--uni | --claude | --version | --help]\n`);
    process.exit(1);
  }

  const wantsUniversal = args.includes("--uni");
  const wantsClaude = args.includes("--claude");

  if (wantsUniversal && wantsClaude) {
    console.error(`\n  ✖  --uni and --claude cannot be combined; pick one.\n`);
    process.exit(1);
  }

  // isTTY is a predicate taking a stream, not a boolean. Treating it as a
  // boolean made this check dead code, so a non-interactive run rendered a
  // prompt into a stream nobody was reading, created nothing, and exited 0.
  const hasTTY = isTTY(process.stdin) && isTTY(process.stdout);
  interactive = !wantsUniversal && !wantsClaude && hasTTY;

  const tag = grey(`[agent-sesh v${VERSION}]`);
  let selectedEnv;

  if (wantsUniversal) {
    selectedEnv = "universal";
    console.log(`${tag} Setting up Universal (AGENTS.md)…`);
  } else if (wantsClaude) {
    selectedEnv = "claude";
    console.log(`${tag} Setting up Claude Code (CLAUDE.md)…`);
  } else if (!hasTTY) {
    selectedEnv = "universal";
    console.log(
      `${tag} No interactive terminal detected — defaulting to Universal (AGENTS.md). Pass --claude for Claude Code.`,
    );
  } else {
    intro(`${bold("\u{1F9E0} agent-sesh")}  ${grey(`v${VERSION}`)}`);
    note(describeWorkspace(), "Workspace");
    selectedEnv = await selectEnvironment();
    if (selectedEnv === null) bail("Cancelled.");
  }

  const warnings = [];
  const infoNotes = [];

  if (selectedEnv === "reinit") {
    const proceed = await confirmReinit();
    if (proceed === null) bail("Cancelled.");

    if (!proceed) {
      outro(`${yellow("Reinit cancelled.")} Nothing was changed.`);
      return;
    }

    const { moved, warnings: moveWarnings } = reinitAgentsDirectory();
    warnings.push(...moveWarnings);

    if (moved.length > 0) {
      log.step(
        `Moved ${bold(String(moved.length))} custom item(s) to ${bold(".agents/custom/")}`,
      );
    }

    const hadAgents = isRegularFile(agentsFile);
    const hadClaude = isRegularFile(claudeFile);

    for (const [file, name] of [
      [agentsFile, "AGENTS.md"],
      [claudeFile, "CLAUDE.md"],
    ]) {
      const retired = retirePointerFile(file, name);
      if (retired.action === "kept") {
        warnings.push(`Left ${name} in place — it could not be read (${retired.reason}).`);
      }
    }

    if (hadAgents && hadClaude) {
      selectedEnv = interactive ? await chooseEnvironment(true) : "universal";
      if (selectedEnv === null) bail("Cancelled.");
    } else {
      selectedEnv = hadClaude ? "claude" : "universal";
    }
  }

  const targetFile = selectedEnv === "universal" ? agentsFile : claudeFile;
  const otherFile = selectedEnv === "universal" ? claudeFile : agentsFile;
  const targetName = selectedEnv === "universal" ? "AGENTS.md" : "CLAUDE.md";
  const otherName = selectedEnv === "universal" ? "CLAUDE.md" : "AGENTS.md";

  // Every question is asked before anything is written, so the run is
  // "answer, then watch it work" rather than being interrupted afterwards.
  const repositoryWarning = await ensureGitRepository();

  const progress = interactive ? spinner() : null;
  if (progress) progress.start("Building the project brain");

  let created;
  let existing;
  let total;
  let result;
  let protectionStatus;
  let hooks;

  try {
    ({ created, existing, total } = ensureAgentsDirectory());
    warnings.push(...migrateRootBackups());

    result = retargetPointerFile(targetFile, targetName, otherFile, otherName);
    protectionStatus = protectFile(targetFile);

    if (backupWasWritten) {
      ensureBackupReadme();
    }

    hooks = installGitHooks();
  } catch (err) {
    if (progress) progress.stop("Setup failed", 1);
    throw err;
  }

  if (progress) progress.stop(`Project brain ready in ${bold(".agents/")}`);

  if (repositoryWarning) warnings.push(repositoryWarning);
  warnings.push(...hooks.warnings);
  infoNotes.push(...hooks.notes);

  const agentsFileStatus = result.status;

  if (result.conflict) {
    const { retired, otherName: conflictName } = result.conflict;
    const savedAs =
      retired.action === "backed-up"
        ? `saved as ${bold(retired.backupName)}`
        : "already present in the backups";

    infoNotes.push(
      [
        `Both ${targetName} and ${conflictName} had custom content.`,
        `Kept ${bold(targetName)} unchanged; ${conflictName} was ${savedAs}.`,
      ].join("\n"),
    );
  }

  const summaryRows = [
    [".agents/", getAgentsDirectoryStatus(created, existing, total)],
    [targetName, getAgentsFileStatus(agentsFileStatus)],
    [
      "protection",
      protectionStatus === "read-only"
        ? green("read-only")
        : yellow(protectionStatus),
    ],
    [
      "git hooks",
      hooks.installed.length
        ? green(hooks.installed.join(", "))
        : dim("not installed"),
    ],
  ];

  if (isBackupStatus(agentsFileStatus)) {
    summaryRows.push([
      "backup",
      `.agents/old_agent_files/${agentsFileStatus}`,
    ]);
  }

  if (interactive) {
    note(alignRows(summaryRows), "Summary");

    for (const message of infoNotes) {
      log.info(message);
    }

    for (const message of warnings) {
      log.warn(message);
    }

    note(nextSteps(targetName), "Next steps");
    outro(`${green("Done")} — ${bold(targetName)} now points agents at .agents/`);
  } else {
    console.log(`${tag} Project brain ready ✅`);
    console.log("");
    console.log(alignRows(summaryRows.map(([k, v]) => [`  ${k}`, v])));

    for (const message of [...infoNotes, ...warnings]) {
      console.log("");
      console.log(message);
    }

    console.log("");
    console.log(`  ${targetName} now points agents at .agents/`);
  }
}

main().catch((err) => {
  restoreCursor();
  console.error(`\n  ✖  ${err.message}\n`);
  process.exit(1);
});
