#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const readline = require("readline");

const projectRoot = process.cwd();
const agentsDirName = ".agents";
const target = path.join(projectRoot, agentsDirName);
const agentsFile = path.join(projectRoot, "AGENTS.md");
const claudeFile = path.join(projectRoot, "CLAUDE.md");
const yellow = "\x1b[33m";
const reset = "\x1b[0m";

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
- tasks.md: next actionable tasks.
- last-session.md: handoff notes from the most recent session.
- decisions.md: settled technical decisions and tradeoffs.
- context.md: project intent, goals, and non-goals.
- style.md: coding and writing style preferences.
- roadmap.md: near-future direction.
- constraints.md: hard rules and limits.
- known-issues.md: known bugs, fragile areas, and technical debt.
- glossary.md: project-specific terms.
`,
  "state.md": `# State

Describe how the project works right now. Keep this present-tense and accurate. Include runtime behavior, important components, and data flow here.

## Current State

## Implemented

## Missing Or Partial

## Pipeline And Flow

## Side Effects

## Invariants
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

## Assumptions

## Needs Verification
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
  "known-issues.md": `# Known Issues

Record known bugs, fragile areas, workarounds, and technical debt.

## Bugs

## Fragile Areas

## Workarounds

## Technical Debt
`,
  "glossary.md": `# Glossary

Define project-specific terms and domain language.

## Terms

## Acronyms

## Ambiguous Words
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
- **Numbering is based on last-modified date**: the oldest file is \`_1\`, the
  next oldest is \`_2\`, and so on. The highest number is the most recent backup.
- Files are **deduplicated by content**: if two backups have identical content,
  only one copy is kept.

## When Backups Are Created

- Running \`agent-sesh\` when the existing pointer file has custom content that
  differs from the default template.
- Switching environments (e.g., from AGENTS.md to CLAUDE.md) when the pointer
  file has been customized.

Backups are **not** created when:
- The pointer file matches the default agent-sesh template (either variant).
- An identical backup already exists.
`;

function getBackupDir(fileName) {
  const subdir = fileName === "CLAUDE.md" ? "claude" : "agents";
  const dir = path.join(target, "old_agent_files", subdir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureBackupReadme() {
  const oldAgentFilesDir = path.join(target, "old_agent_files");
  fs.mkdirSync(oldAgentFilesDir, { recursive: true });

  const readmePath = path.join(oldAgentFilesDir, "README.md");

  // Write or update the README
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, oldAgentFilesReadme);
  } else {
    const existing = fs.readFileSync(readmePath, "utf8");
    if (existing !== oldAgentFilesReadme) {
      unlockFile(readmePath);
      fs.writeFileSync(readmePath, oldAgentFilesReadme);
    }
  }

  protectFile(readmePath);

  // Create symlinks in the claude/ and agents/ subdirectories
  for (const subdir of ["claude", "agents"]) {
    const subdirPath = path.join(oldAgentFilesDir, subdir);
    fs.mkdirSync(subdirPath, { recursive: true });
    const linkPath = path.join(subdirPath, "README.md");

    try {
      // Remove existing file/link if present
      if (fs.existsSync(linkPath)) {
        const stat = fs.lstatSync(linkPath);
        if (stat.isSymbolicLink()) {
          const target = fs.readlinkSync(linkPath);
          if (target === path.join("..", "README.md")) continue; // already correct
        }
        fs.unlinkSync(linkPath);
      }
      fs.symlinkSync(path.join("..", "README.md"), linkPath);
    } catch {
      // Best-effort; some filesystems don't support symlinks
    }
  }
}

function getAvailableBackupPath(fileName) {
  const dir = getBackupDir(fileName);
  const base = fileName.replace(".md", "");
  let index = 1;
  let candidate = path.join(dir, `OLD_${base}_${index}.md`);

  while (fs.existsSync(candidate)) {
    index += 1;
    candidate = path.join(dir, `OLD_${base}_${index}.md`);
  }

  return candidate;
}

function hasDuplicateBackup(fileName, contentToBackup) {
  const dir = getBackupDir(fileName);
  const base = fileName.replace(".md", "");
  let index = 1;
  let candidate = path.join(dir, `OLD_${base}_${index}.md`);

  while (fs.existsSync(candidate)) {
    try {
      const backupContent = fs.readFileSync(candidate, "utf8");
      if (backupContent === contentToBackup) {
        return true;
      }
    } catch {
      // Ignore read errors
    }
    index += 1;
    candidate = path.join(dir, `OLD_${base}_${index}.md`);
  }

  return false;
}

function canPromptForElevation() {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

function preflightSudo() {
  // On Windows, no sudo needed.
  if (process.platform === "win32") return true;

  // Already running as root — no sudo needed.
  try {
    if (process.getuid() === 0) return true;
  } catch {}

  if (!canPromptForElevation()) return false;

  // Validate sudo credentials upfront and cache the session.
  // All subsequent sudo calls (chattr, chflags) will reuse the cached
  // credentials without re-prompting.
  try {
    childProcess.execFileSync("sudo", ["-v"], { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

function runQuiet(command, args) {
  try {
    childProcess.execFileSync(command, args, {
      stdio: "ignore",
    });
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
    childProcess.execFileSync("sudo", [command, ...args], {
      stdio: "inherit",
    });
    return true;
  } catch {
    return false;
  }
}

function makeReadOnly(filePath) {
  try {
    fs.chmodSync(filePath, 0o444);
  } catch {
  }

  if (process.platform === "win32") {
    runQuiet("attrib", ["+R", filePath]);
  }

  return true;
}

function makeWritable(filePath) {
  try {
    fs.chmodSync(filePath, 0o644);
  } catch {
  }

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

function makeLinuxImmutable(filePath) {
  if (process.platform !== "linux") {
    return false;
  }

  if (isLinuxImmutable(filePath)) {
    return true;
  }

  runWithElevation("chattr", ["+i", filePath]);
  return isLinuxImmutable(filePath);
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
    return childProcess.execFileSync("stat", ["-f", "%Sf", filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function makeMacImmutable(filePath) {
  if (process.platform !== "darwin") {
    return null;
  }

  let flags = getMacFlags(filePath);

  if (flags.includes("schg")) {
    return "system-immutable";
  }

  runWithElevation("chflags", ["schg", filePath]);
  flags = getMacFlags(filePath);

  if (flags.includes("schg")) {
    return "system-immutable";
  }

  if (flags.includes("uchg")) {
    return "user-immutable";
  }

  runWithElevation("chflags", ["uchg", filePath]);
  flags = getMacFlags(filePath);

  if (flags.includes("uchg")) {
    return "user-immutable";
  }

  return null;
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

function protectWindowsFile(filePath) {
  if (process.platform !== "win32") {
    return false;
  }

  const script = `
param([string]$Path)
$item = Get-Item -LiteralPath $Path -Force
$item.IsReadOnly = $true
$acl = Get-Acl -LiteralPath $Path
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$rights = [System.Security.AccessControl.FileSystemRights]::Write -bor [System.Security.AccessControl.FileSystemRights]::Delete
$existingRules = @($acl.Access | Where-Object {
  $_.IdentityReference.Value -eq $identity -and
  $_.AccessControlType -eq "Deny" -and
  (($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Write) -or
   ($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Delete))
})
foreach ($existingRule in $existingRules) { [void]$acl.RemoveAccessRule($existingRule) }
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, $rights, "Deny")
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $Path -AclObject $acl
`;

  return runPowerShell(script, filePath);
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

function getTemplateContent(fileName) {
  return agentsFileContent.replace(/AGENTS\.md/g, fileName);
}

function unlockFile(filePath) {
  unlockLinuxImmutable(filePath);
  unlockMacImmutable(filePath);
  unlockWindowsFile(filePath);
  makeWritable(filePath);
}

function protectFile(filePath) {
  makeReadOnly(filePath);

  if (makeLinuxImmutable(filePath)) {
    return "linux immutable";
  }

  const macStatus = makeMacImmutable(filePath);

  if (macStatus === "system-immutable") {
    return "macOS system immutable";
  }

  if (macStatus === "user-immutable") {
    return "macOS user immutable";
  }

  if (protectWindowsFile(filePath)) {
    return "Windows ACL deny-write";
  }

  return "read-only fallback";
}

function ensureAgentsDirectory() {
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) {
    console.error(
      "❌ Error: A .agents path already exists here, but it is not a folder.",
    );
    process.exit(1);
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

  return { created, existing };
}

function isDefaultTemplate(content) {
  return content === getTemplateContent("AGENTS.md")
      || content === getTemplateContent("CLAUDE.md");
}

function ensureAgentsFile(filePath, fileName) {
  const content = getTemplateContent(fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content);
    return "created";
  }

  const fileStats = fs.statSync(filePath);
  const existingContent = fileStats.isFile()
    ? fs.readFileSync(filePath, "utf8")
    : null;

  if (existingContent === content) {
    return "unchanged";
  }

  // If the existing content is just the default agent-sesh template
  // (either the AGENTS.md or CLAUDE.md variant), there is nothing
  // custom worth preserving — overwrite without creating a backup.
  if (existingContent && isDefaultTemplate(existingContent)) {
    unlockFile(filePath);
    fs.writeFileSync(filePath, content);
    return "recreated";
  }

  // Avoid creating duplicate backups if the same content is already backed up
  if (existingContent && hasDuplicateBackup(fileName, existingContent)) {
    unlockFile(filePath);
    fs.writeFileSync(filePath, content);
    return "recreated";
  }

  const backupPath = getAvailableBackupPath(fileName);
  unlockFile(filePath);

  try {
    fs.renameSync(filePath, backupPath);
  } catch (err) {
    if (isLinuxImmutable(filePath)) {
      throw new Error(
        `${fileName} is immutable. Run \`sudo chattr -i ${fileName}\`, then run agent-sesh again.`,
      );
    }

    throw err;
  }

  fs.writeFileSync(filePath, content);
  return path.basename(backupPath);
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

function getAgentsFileStatus(status) {
  if (status === "created") {
    return "created";
  }

  if (status === "unchanged") {
    return "already configured";
  }

  if (status === "recreated") {
    return "recreated (backup already exists)";
  }

  if (status.startsWith("migrated from")) {
    return status;
  }

  return `created; previous file saved as ${status}`;
}

function getProtectionStatus(status) {
  return status;
}

function printReport({
  created,
  existing,
  total,
  agentsFileStatus,
  protectionStatus,
  fileName,
}) {
  console.log("[agent-sesh] Project brain setup completed ✅");
  console.log("");
  console.log("Status");
  console.log(
    `  .agents/    ${getAgentsDirectoryStatus(created, existing, total)}`,
  );
  console.log(`  ${fileName.padEnd(11)} ${getAgentsFileStatus(agentsFileStatus)}`);
  console.log(`  protection  ${getProtectionStatus(protectionStatus)}`);

  if (agentsFileStatus !== "created" && agentsFileStatus !== "unchanged" && !agentsFileStatus.startsWith("migrated")) {
    console.log("");
    console.log(
      `${yellow}The existing ${fileName} content was preserved in ${agentsFileStatus}.${reset}`,
    );
  }

  console.log("");
  console.log(`${fileName} now directs agents to read .agents/ before working.`);
  console.log("");
  console.log("How to use:");
  console.log("   │");
  console.log(`   ├─ Just tag @${fileName} before writing prompt`);
  console.log("   │");
  console.log("   └─ To force a deep-dive, tag @.agents/ or @.agents/README.md");
}

function selectEnvironment() {
  return new Promise((resolve) => {
    const args = process.argv.slice(2);
    if (args.includes("--uni")) {
      resolve("universal");
      return;
    }
    if (args.includes("--claude")) {
      resolve("claude");
      return;
    }
    if (args.includes("--help") || args.includes("-h")) {
      console.log(`Usage: npx agent-sesh [options]

Options:
  --uni      Directly setup/switch to Universal (AGENTS.md) - Codex, Windsurf, Cursor, etc…
  --claude   Directly setup/switch to Claude Code
  -h, --help Show help description
`);
      process.exit(0);
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      resolve("universal");
      return;
    }

    const agentsDirExists = fs.existsSync(target) && fs.statSync(target).isDirectory();
    const agentsFileExists = fs.existsSync(agentsFile) && fs.statSync(agentsFile).isFile();
    const claudeFileExists = fs.existsSync(claudeFile) && fs.statSync(claudeFile).isFile();
    const isSwitch = agentsDirExists && (agentsFileExists || claudeFileExists);

    const options = [
      { name: "🟢 Universal (AGENTS.md) - Codex, Windsurf, Cursor, etc…" , value: "universal" },
      { name: "🟠 Claude Code (CLAUDE.md)", value: "claude" }
    ];

    const linesToMove = options.length;
    let selectedIndex = 0;

    const pink = "\x1b[35m";
    const rst = "\x1b[0m";

    console.log("🧠 agent-sesh: Generating Project Brain...\n");
    if (isSwitch) {
      console.log(`❓ Which AI coding agent environment(s) do you want to ${pink}SWITCH${rst} to?`);
    } else {
      console.log(`❓ Which AI coding agent environment(s) do you want to ${pink}SETUP${rst}?`);
    }

    function render() {
      for (let i = 0; i < options.length; i++) {
        const prefix = i === selectedIndex ? "❯ " : "  ";
        const color = i === selectedIndex ? "\x1b[36m" : "";
        process.stdout.write(`${prefix}${color}${options[i].name}\x1b[0m\n`);
      }
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    render();

    function onKeypress(str, key) {
      if (key) {
        if (key.ctrl && key.name === 'c') {
          process.stdin.setRawMode(false);
          process.exit();
        } else if (key.name === 'up') {
          selectedIndex = (selectedIndex - 1 + options.length) % options.length;
          readline.moveCursor(process.stdout, 0, -linesToMove);
          render();
        } else if (key.name === 'down') {
          selectedIndex = (selectedIndex + 1) % options.length;
          readline.moveCursor(process.stdout, 0, -linesToMove);
          render();
        } else if (key.name === 'return' || key.name === 'enter') {
          process.stdin.removeAllListeners('keypress');
          process.stdin.removeAllListeners('data');
          process.stdin.setRawMode(false);
          process.stdin.pause();

          // Two-step TTY restoration after raw mode:
          //
          // 1. `stty sane` resets kernel TTY flags (ECHO, ICANON, ICRNL, etc.)
          //    to sane defaults. Node's setRawMode(false) should do this, but
          //    doesn't always fully restore all flags.
          //
          // 2. `tcflush(TCIFLUSH)` discards any stale bytes left in the kernel
          //    input queue from raw mode (e.g. the \r\n from the Enter keypress).
          //    Without this, sudo's getpass() reads stale bytes as empty passwords
          //    and fails. stty sane does NOT flush input — only tcflush does.
          if (process.platform !== 'win32') {
            try {
              childProcess.execFileSync('stty', ['sane'], { stdio: 'inherit' });
            } catch {
              // best-effort
            }
            try {
              childProcess.execFileSync('python3', [
                '-c',
                'import termios; termios.tcflush(0, termios.TCIFLUSH)'
              ], { stdio: ['inherit', 'ignore', 'ignore'] });
            } catch {
              // python3 may not be available; best-effort
            }
          }

          readline.moveCursor(process.stdout, 0, -linesToMove);
          readline.clearScreenDown(process.stdout);

          resolve(options[selectedIndex].value);
        }
      }
    }

    process.stdin.on('keypress', onKeypress);
  });
}

function migrateRootBackups() {
  // Consolidate all OLD_CLAUDE_*.md and OLD_AGENTS_*.md files from both the
  // project root and the backup directory. Deduplicate by content, sort by
  // last-modified date (oldest = 1), and write sequentially into the backup dir.
  const types = [
    { pattern: /^OLD_CLAUDE_\d+\.md$/, name: "CLAUDE.md", base: "CLAUDE" },
    { pattern: /^OLD_AGENTS_\d+\.md$/, name: "AGENTS.md", base: "AGENTS" },
  ];

  for (const type of types) {
    const destDir = getBackupDir(type.name);

    // Collect matching files from both project root and backup directory
    const allFiles = [];

    for (const dir of [projectRoot, destDir]) {
      try {
        for (const entry of fs.readdirSync(dir)) {
          if (type.pattern.test(entry)) {
            const filePath = path.join(dir, entry);
            // Avoid duplicates if projectRoot === destDir (shouldn't happen, but guard)
            if (!allFiles.includes(filePath)) {
              allFiles.push(filePath);
            }
          }
        }
      } catch {
        // Directory might not exist yet
      }
    }

    if (allFiles.length === 0) continue;

    // Read content and mtime for each file, deduplicate by content
    const seen = new Set();
    const uniqueEntries = [];

    for (const filePath of allFiles) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        if (!seen.has(content)) {
          seen.add(content);
          const mtime = fs.statSync(filePath).mtimeMs;
          uniqueEntries.push({ content, mtime });
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Sort by modification time — oldest first gets the lowest number
    uniqueEntries.sort((a, b) => a.mtime - b.mtime);

    // Delete all originals from both locations
    for (const filePath of allFiles) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Best-effort
      }
    }

    // Write deduplicated files with sequential numbering
    for (let i = 0; i < uniqueEntries.length; i++) {
      const finalPath = path.join(destDir, `OLD_${type.base}_${i + 1}.md`);
      fs.writeFileSync(finalPath, uniqueEntries[i].content);
    }
  }
}

async function main() {
  try {
    const selectedEnv = await selectEnvironment();

    // Validate sudo access BEFORE touching any files.
    // If the user can't authenticate, abort cleanly.
    if (!preflightSudo()) {
      console.error("❌ agent-sesh requires elevated privileges to protect files. Aborting.");
      process.exit(1);
    }

    const targetFile = selectedEnv === "universal" ? agentsFile : claudeFile;
    const otherFile = selectedEnv === "universal" ? claudeFile : agentsFile;
    const targetName = selectedEnv === "universal" ? "AGENTS.md" : "CLAUDE.md";
    const otherName = selectedEnv === "universal" ? "CLAUDE.md" : "AGENTS.md";

    const { created, existing } = ensureAgentsDirectory();
    migrateRootBackups();
    ensureBackupReadme();
    
    let agentsFileStatus;
    let protectionStatus;

    if (fs.existsSync(otherFile) && fs.statSync(otherFile).isFile()) {
      console.log(`🔄 Switching environment from ${otherName} to ${targetName}...`);
      
      const contentToMirror = fs.readFileSync(otherFile, "utf8");
      
      if (fs.existsSync(targetFile)) {
        unlockFile(targetFile);
      }
      
      fs.writeFileSync(targetFile, contentToMirror);
      protectionStatus = protectFile(targetFile);
      
      // Cleanup the other file
      try {
        unlockFile(otherFile);
        fs.unlinkSync(otherFile);
      } catch (err) {
        console.warn(`⚠️ Warning: Could not delete ${otherName}:`, err.message);
      }
      
      agentsFileStatus = `migrated from ${otherName}`;
    } else {
      agentsFileStatus = ensureAgentsFile(targetFile, targetName);
      protectionStatus = protectFile(targetFile);
    }

    const files = fs.readdirSync(target);

    printReport({
      created,
      existing,
      total: files.length,
      agentsFileStatus,
      protectionStatus,
      fileName: targetName,
    });
  } catch (err) {
    console.error("[agent-sesh] Failed to create project brain:", err.message);
    process.exit(1);
  }
}

main();
