"use strict";

// Shared fixtures and runners for the agent-sesh test suite.
//
// Everything runs the real CLI in a throwaway project under a fake HOME, so
// agent detection is deterministic and nothing on the developer's machine is
// read or written. Interactive flows go through test/drive-pty.py.

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CLI = path.resolve(__dirname, "..", "index.js");
// Not `pty.py`: a script by that name shadows Python's own pty module.
const PTY = path.resolve(__dirname, "drive-pty.py");

// Static data only: registry, environments, templates. Anything that reads
// the working directory is exercised through a child process instead.
const cli = require(CLI);

const created = [];

// Canonical: macOS's temp dir is a symlink (/var → /private/var) and Windows
// runners hand out 8.3 short names; the CLI and git both report real paths.
function tempDir(prefix) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), `agent-sesh-${prefix}-`)));
  created.push(dir);
  return dir;
}

function makeProject({ git = true, name = "proj" } = {}) {
  const dir = path.join(tempDir("proj"), name);
  fs.mkdirSync(dir);
  if (git) spawnSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

// A home directory carrying the install markers of the given agents, so the
// registry's detection sees exactly those and nothing else.
function makeHome(agentIds = []) {
  const home = tempDir("home");
  fs.mkdirSync(path.join(home, ".config"));

  for (const id of agentIds) {
    const agent = cli.agentRegistry.find((entry) => entry.id === id);
    if (!agent) throw new Error(`unknown agent ${id}`);
    const markers = agent.detect.map((m) => m.split("|").pop());
    const marker = markers.find((m) => m.startsWith("~/") || m.startsWith("config/"));
    if (!marker) throw new Error(`agent ${id} has no home marker`);
    const relative = marker.startsWith("~/") ? marker.slice(2) : path.join(".config", marker.slice("config/".length));
    fs.mkdirSync(path.join(home, relative), { recursive: true });
  }

  return home;
}

let defaultHome = null;

const OVERRIDE_VARS = [
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
  "VIBE_HOME",
  "SARVAM_HOME",
  "HERMES_HOME",
  "AUTOHAND_HOME",
  "GROK_HOME",
  "APPDATA",
  "FLATPAK_XDG_CONFIG_HOME",
  "XDG_CONFIG_HOME",
  "NO_COLOR",
  "TERM",
  // Git for Windows falls back to these to find the host's global config.
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
];

function env({ home, extra = {}, omit = [] } = {}) {
  if (!defaultHome) defaultHome = makeHome([]);
  const result = { ...process.env };
  for (const name of OVERRIDE_VARS) delete result[name];
  const homeDir = home || defaultHome;
  const merged = {
    ...result,
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CONFIG_HOME: path.join(homeDir, ".config"),
    NO_COLOR: "1",
    TERM: "xterm-256color",
    ...extra,
  };
  for (const name of omit) delete merged[name];
  return merged;
}

// Windows spells it "Path"; a test that empties it has to hit the real key.
function pathKey() {
  return Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") || "PATH";
}

// Non-interactive run: stdin is a pipe, so the CLI never prompts.
function run(dir, args = [], options = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: env(options),
    input: "",
    timeout: 60000,
  });
  return {
    code: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    out: `${result.stdout || ""}${result.stderr || ""}`,
  };
}

// Runs a snippet with index.js required as a module from inside `dir`, so
// the cwd-dependent helpers (discovery, the guard) see that project.
function inProject(dir, script, options = {}) {
  const result = spawnSync(
    process.execPath,
    ["-e", `process.chdir(${JSON.stringify(dir)}); const cli = require(${JSON.stringify(CLI)}); ${script}`],
    { cwd: dir, encoding: "utf8", env: env(options), timeout: 60000 },
  );
  if (result.status !== 0) {
    throw new Error(`inProject failed: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

let pythonChecked = null;

function hasPython() {
  if (pythonChecked === null) {
    // drive-pty.py needs fcntl/termios, which Python does not have on Windows.
    if (process.platform === "win32") {
      pythonChecked = false;
    } else {
      const probe = spawnSync("python3", ["-c", "import pty, fcntl, termios"], { encoding: "utf8" });
      pythonChecked = probe.status === 0;
    }
  }
  return pythonChecked;
}

const skipWithoutPython = () =>
  hasPython() ? false : "interactive tests need a Unix pty (python3 with the pty module)";

// POSIX permission bits: absent on Windows, and root ignores them anyway.
function skipUnlessPosixPermissions() {
  if (process.platform === "win32") return "POSIX permission bits do not apply on Windows";
  if (process.getuid && process.getuid() === 0) return "root can read and write anything";
  return false;
}

// A directory link the way `npx skills` creates one: a relative symlink on
// POSIX, a junction with an absolute target on Windows (no privilege needed).
function linkDir(linkPath, targetPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  if (process.platform === "win32") {
    fs.symlinkSync(path.resolve(targetPath), linkPath, "junction");
  } else {
    fs.symlinkSync(path.relative(path.dirname(linkPath), targetPath), linkPath, "dir");
  }
  return linkPath;
}

// readlinkSync on Windows returns absolute targets with a \\?\ prefix.
function linkTarget(linkPath) {
  return fs.readlinkSync(linkPath).replace(/^\\\\\?\\/, "");
}

let symlinkChecked = null;

// Real symlinks (not junctions) need Developer Mode or elevation on Windows.
function canSymlink() {
  if (symlinkChecked === null) {
    const dir = tempDir("symlink");
    fs.mkdirSync(path.join(dir, "target"));
    try {
      fs.symlinkSync(path.join(dir, "target"), path.join(dir, "link"), "dir");
      symlinkChecked = true;
    } catch {
      symlinkChecked = false;
    }
  }
  return symlinkChecked;
}

const skipWithoutSymlinks = () =>
  canSymlink() ? false : "creating symlinks needs Developer Mode or an elevated shell on Windows";

// Interactive run through a real pty. `steps` is the pty.py script.
function pty(dir, steps, args = [], options = {}) {
  const result = spawnSync(
    "python3",
    [PTY, dir, steps, process.execPath, CLI, ...args],
    {
      encoding: "utf8",
      env: { ...env(options), PTY_COLS: String(options.cols || 80) },
      timeout: 120000,
    },
  );
  const out = result.stdout || "";
  const trailer = out.match(/\[\[pty-steps-completed=(\d+)\/(\d+) exit=(-?\d+)\]\]/);
  return {
    out,
    stderr: result.stderr || "",
    done: trailer ? Number(trailer[1]) : -1,
    total: trailer ? Number(trailer[2]) : -1,
    exit: trailer ? Number(trailer[3]) : null,
  };
}

// Every file and symlink under dir, keyed by posix-relative path.
// Files carry a content hash and mode; symlinks carry their target.
function snapshot(dir, { skip = [".git"] } = {}) {
  const entries = new Map();

  const walk = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      const full = path.join(current, name);
      const relative = path.relative(dir, full).split(path.sep).join("/");
      if (skip.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`))) continue;

      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) {
        entries.set(relative, `L:${fs.readlinkSync(full)}`);
      } else if (stat.isDirectory()) {
        entries.set(`${relative}/`, "D");
        walk(full);
      } else {
        const hash = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex").slice(0, 16);
        entries.set(relative, `F:${hash}:${(stat.mode & 0o777).toString(8)}`);
      }
    }
  };

  walk(dir);
  return entries;
}

// The subset of a snapshot that belongs to skills: every path with a
// `skills` segment, plus the lock file. Nothing agent-sesh writes has one.
function skillsView(snap) {
  return new Map(
    [...snap].filter(
      ([relative]) =>
        relative === cli.skillsLockFileName ||
        /(^|\/)skills(\/|$)/.test(relative),
    ),
  );
}

function assertSameMap(assert, actual, expected, label) {
  const missing = [...expected].filter(([k, v]) => actual.get(k) !== v).map(([k]) => k);
  const extra = [...actual].filter(([k]) => !expected.has(k)).map(([k]) => k);
  assert.deepEqual(
    { missing, extra },
    { missing: [], extra: [] },
    `${label}: changed/missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)}`,
  );
}

// Every folder `npx skills` can install into, canonical first.
function skillsFolders() {
  const seen = new Set();
  const folders = [];
  for (const dir of [cli.canonicalSkillsDir, ...cli.agentRegistry.map((a) => a.skillsDir)]) {
    if (!seen.has(dir)) {
      seen.add(dir);
      folders.push(dir);
    }
  }
  return folders;
}

function skillMarkdown(name, body = "") {
  return `---\nname: ${name}\ndescription: Test skill ${name}\n---\n\n# ${name}\n\n${body}`;
}

// A skill folder the way skills lays it out: SKILL.md plus a sibling file.
// With `link`, a relative symlink to the copy under that folder instead —
// the exact shape skills creates for non-universal agents.
function fixtureSkill(dir, folder, name, { link = null, body = "" } = {}) {
  const target = path.join(dir, ...folder.split("/"), name);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  if (link) {
    return linkDir(target, path.join(dir, ...link.split("/"), name));
  }

  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "SKILL.md"), skillMarkdown(name, body));
  fs.mkdirSync(path.join(target, "agents"));
  fs.writeFileSync(path.join(target, "agents", "openai.yaml"), `name: ${name}\n`);
  return target;
}

function writeLock(dir, names, source = "acme/skills") {
  const skills = {};
  for (const name of names) {
    skills[name] = {
      source,
      sourceType: "github",
      skillPath: `skills/${name}/SKILL.md`,
      computedHash: crypto.createHash("sha256").update(name).digest("hex"),
    };
  }
  fs.writeFileSync(
    path.join(dir, cli.skillsLockFileName),
    `${JSON.stringify({ version: 1, skills }, null, 2)}\n`,
  );
}

const read = (file) => fs.readFileSync(file, "utf8");
const exists = (file) => fs.existsSync(file);
const mode = (file) => fs.statSync(file).mode & 0o777;
const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.chmodSync(file, 0o644);
  fs.writeFileSync(file, content);
};

// Hand-written pointer content carrying a sentinel that no template contains,
// so a later search can prove the bytes survived somewhere.
//
// By default it is an *adopted* pointer — customised, but still pointing at
// .agents/handoff/ — which agent-sesh keeps. `foreign: true` produces a file
// from before agent-sesh, which gets backed up and replaced.
function customPointer(fileName, tag = crypto.randomBytes(4).toString("hex"), { foreign = false } = {}) {
  const sentinel = `sentinel-${tag}`;
  const brain = foreign
    ? "Build with make. Tests live in tests/.\n"
    : "Read `.agents/handoff/README.md` first, then the rest of `.agents/handoff/`.\n";
  return {
    sentinel,
    content: `# Hand-written ${fileName}\n\nDo not edit this ${fileName} file.\n\n${brain}\n${sentinel}\n`,
  };
}

function findSentinel(dir, sentinel) {
  const hits = [];
  const walk = (current) => {
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name);
      const stat = fs.lstatSync(full);
      if (stat.isDirectory() && name !== ".git") walk(full);
      else if (stat.isFile() && name.endsWith(".md") && read(full).includes(sentinel)) {
        hits.push(path.relative(dir, full).split(path.sep).join("/"));
      }
    }
  };
  walk(dir);
  return hits;
}

const templateFor = (fileName) => cli.getTemplateContent(fileName);

function cleanup() {
  for (const dir of created.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {}
  }
}

function longestLine(text) {
  return Math.max(0, ...text.split("\n").map((line) => [...line].length));
}

module.exports = {
  CLI,
  cli,
  makeProject,
  makeHome,
  run,
  inProject,
  pty,
  hasPython,
  skipWithoutPython,
  skipUnlessPosixPermissions,
  skipWithoutSymlinks,
  canSymlink,
  linkDir,
  linkTarget,
  pathKey,
  snapshot,
  skillsView,
  assertSameMap,
  skillsFolders,
  fixtureSkill,
  skillMarkdown,
  writeLock,
  read,
  exists,
  mode,
  write,
  customPointer,
  findSentinel,
  templateFor,
  cleanup,
  longestLine,
  handoff: (dir, ...rest) => path.join(dir, ".agents", "handoff", ...rest),
  pointerNames: cli.pointerEnvironments.map((env) => env.fileName),
  flagFor: (fileName) => cli.pointerEnvironments.find((env) => env.fileName === fileName).flag,
  templateCount: Object.keys(cli.agentFiles).length,
};
