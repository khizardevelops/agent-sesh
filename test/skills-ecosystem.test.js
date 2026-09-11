"use strict";

// Compliance with `npx skills`: every folder it can install into, in every
// shape it installs (canonical copy, per-agent symlink, --copy, lock file),
// survives every agent-sesh action byte-for-byte — and agent-sesh can see
// what is installed.

const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const h = require("./helpers");

after(h.cleanup);

const folders = h.skillsFolders();
const allFlags = h.pointerNames.map(h.flagFor);

// One project carrying a skill in every registry folder at once: `alpha` as
// the symlink skills creates by default, `beta` as a --copy install.
function seedEveryFolder(dir) {
  h.fixtureSkill(dir, h.cli.canonicalSkillsDir, "alpha");
  h.fixtureSkill(dir, h.cli.canonicalSkillsDir, "beta");

  for (const folder of folders) {
    if (folder === h.cli.canonicalSkillsDir) continue;
    h.fixtureSkill(dir, folder, "alpha", { link: h.cli.canonicalSkillsDir });
    h.fixtureSkill(dir, folder, "beta");
  }

  h.writeLock(dir, ["alpha", "beta"]);
  // A dangling link, the way a removed canonical skill leaves one behind.
  h.linkDir(path.join(dir, ".claude", "skills", "gone"), path.join(dir, ".agents", "skills", "gone"));
}

describe("registry", () => {
  test("mirrors skills: 77 agents, 56 distinct project skills folders", () => {
    assert.equal(h.cli.agentRegistry.length, 77);
    assert.equal(folders.length, 56);
    assert.equal(folders[0], ".agents/skills");
    for (const agent of h.cli.agentRegistry) {
      assert.match(agent.id, /^[a-z0-9-]+$/);
      assert.ok(agent.skillsDir.endsWith("skills"), `${agent.id}: ${agent.skillsDir}`);
      assert.ok(!path.isAbsolute(agent.skillsDir));
    }
  });

  test("every pointer environment has a flag and a distinct file", () => {
    const files = new Set(h.pointerNames);
    assert.equal(files.size, h.cli.pointerEnvironments.length);
    for (const env of h.cli.pointerEnvironments) {
      assert.match(env.flag, /^--[a-z]+$/);
      assert.match(env.fileName, /^[A-Z]+\.md$/);
    }
    for (const agent of h.cli.agentRegistry) {
      if (agent.pointer) assert.ok(files.has(`${agent.pointer.toUpperCase()}.md`), agent.id);
    }
  });
});

describe("every skills folder survives every action", () => {
  test("non-interactive: single flags, all flags, subsets, re-runs", () => {
    const dir = h.makeProject();
    seedEveryFolder(dir);
    const before = h.skillsView(h.snapshot(dir));
    assert.ok(before.size > folders.length * 2, "fixture seeded");

    const sequences = [["--uni"], ["--claude"], allFlags, ["--gemini"], ["--uni", "--claude"], ["--uni"]];
    for (const args of sequences) {
      const result = h.run(dir, args);
      assert.equal(result.code, 0, result.out);
      assert.match(result.out, /skills\s+2 preserved/);
      h.assertSameMap(assert, h.skillsView(h.snapshot(dir)), before, args.join(" "));
    }

    // agent-sesh never writes a SKILL.md, so skills' own discovery can never
    // mistake the handoff folder for a skill.
    const snap = h.snapshot(dir);
    for (const relative of snap.keys()) {
      if (relative.startsWith(".agents/handoff/")) assert.ok(!relative.endsWith("SKILL.md"), relative);
    }
  });

  test("interactive: reinit archives only the handoff, switch touches only pointers", { skip: h.skipWithoutPython() }, () => {
    const dir = h.makeProject();
    seedEveryFolder(dir);
    assert.equal(h.run(dir, ["--uni", "--claude"]).code, 0);
    h.write(h.handoff(dir, "memory", "state.md"), "# State\n\nreal content\n");
    const before = h.skillsView(h.snapshot(dir));

    const reinit = h.pty(dir, "wait:What do you want to do;send:down;send:enter;wait:Proceed;send:enter;wait:Done");
    assert.equal(reinit.exit, 0, reinit.out);
    assert.match(reinit.out, /skills\s+2 preserved/);
    h.assertSameMap(assert, h.skillsView(h.snapshot(dir)), before, "reinit");

    const archives = fs.readdirSync(h.handoff(dir, "archive")).filter((n) => n !== "README.md");
    assert.equal(archives.length, 1);
    const archived = fs.readdirSync(h.handoff(dir, "archive", archives[0])).sort();
    assert.deepEqual(archived, ["README.md", "manifest.json", "memory", "references", "rules"]);

    // Switch: keep only CLAUDE.md (deselect the first entry, Universal).
    const sw = h.pty(dir, "wait:What do you want to do;send:enter;wait:pointer file;send:space;send:enter;wait:Done");
    assert.equal(sw.exit, 0, sw.out);
    assert.ok(!h.exists(path.join(dir, "AGENTS.md")));
    assert.ok(h.exists(path.join(dir, "CLAUDE.md")));
    h.assertSameMap(assert, h.skillsView(h.snapshot(dir)), before, "switch");
  });

  test("--copy layout: an agent folder without any .agents/", () => {
    const dir = h.makeProject();
    h.fixtureSkill(dir, ".claude/skills", "solo");
    h.writeLock(dir, ["solo"]);
    const before = h.skillsView(h.snapshot(dir));

    const result = h.run(dir, ["--claude"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /skills\s+1 preserved/);
    h.assertSameMap(assert, h.skillsView(h.snapshot(dir)), before, "copy layout");
    assert.ok(h.exists(h.handoff(dir, "README.md")));
  });

  test("the three non-dot folders (OpenClaw, Eve, AstrBot) are never touched", () => {
    const dir = h.makeProject();
    for (const folder of ["skills", "agent/skills", "data/skills"]) h.fixtureSkill(dir, folder, "plain");
    const before = h.skillsView(h.snapshot(dir));
    assert.equal(h.run(dir, ["--uni"]).code, 0);
    h.assertSameMap(assert, h.skillsView(h.snapshot(dir)), before, "non-dot folders");
  });

  test("odd shapes never crash: skills as a file, as a symlink, corrupt lock", () => {
    const asFile = h.makeProject();
    fs.mkdirSync(path.join(asFile, ".agents"));
    fs.writeFileSync(path.join(asFile, ".agents", "skills"), "not a folder");
    fs.writeFileSync(path.join(asFile, h.cli.skillsLockFileName), "{ corrupt");
    const r1 = h.run(asFile, ["--uni"]);
    assert.equal(r1.code, 0, r1.out);
    assert.equal(h.read(path.join(asFile, ".agents", "skills")), "not a folder");
  });

  test("a skills folder that is a symlink to a store elsewhere is followed and left alone", { skip: h.skipWithoutSymlinks() }, () => {
    const asLink = h.makeProject();
    const elsewhere = h.makeProject({ git: false, name: "elsewhere" });
    h.fixtureSkill(elsewhere, "store", "shared");
    fs.mkdirSync(path.join(asLink, ".agents"));
    const link = path.join(asLink, ".agents", "skills");
    fs.symlinkSync(path.join(elsewhere, "store"), link, "dir");
    const before = h.snapshot(elsewhere);
    const r2 = h.run(asLink, ["--uni", "--claude"]);
    assert.equal(r2.code, 0, r2.out);
    assert.match(r2.out, /skills\s+1 preserved/);
    h.assertSameMap(assert, h.snapshot(elsewhere), before, "linked store");
    assert.equal(path.relative(path.resolve(h.linkTarget(link)), path.join(elsewhere, "store")), "");
  });
});

describe("skills awareness", () => {
  test("discovery names skills, attributes agents, reads the lock, flags dangling links", () => {
    const dir = h.makeProject();
    seedEveryFolder(dir);

    const found = h.inProject(dir, "console.log(JSON.stringify(cli.discoverSkills()))");
    assert.deepEqual(found.skills.map((s) => s.name).sort(), ["alpha", "beta"]);
    const alpha = found.skills.find((s) => s.name === "alpha");
    assert.equal(alpha.source, "acme/skills");
    assert.ok(alpha.agents.includes("Claude Code"));
    assert.ok(alpha.agents.includes("Windsurf"));
    assert.ok(alpha.agents.includes("Codex"));
    assert.ok(!alpha.agents.includes("Universal"));
    assert.deepEqual(found.broken, [{ name: "gone", folder: ".claude/skills" }]);
    assert.equal(found.lockPath, path.join(dir, h.cli.skillsLockFileName));
    assert.deepEqual(found.folders.length, folders.length);
  });

  test("frontmatter: quoted names, colons in values, missing name falls back to folder", () => {
    const parse = h.cli.parseSkillFrontmatter;
    assert.deepEqual(parse('---\nname: "x y"\ndescription: A thing: with colon\n---\nbody'), {
      name: "x y",
      description: "A thing: with colon",
    });
    assert.deepEqual(parse("no frontmatter"), {});
    assert.deepEqual(parse("---\r\nname: crlf\r\n---\r\n"), { name: "crlf" });

    const dir = h.makeProject();
    fs.mkdirSync(path.join(dir, ".agents", "skills", "nameless"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".agents", "skills", "nameless", "SKILL.md"), "# no frontmatter\n");
    fs.mkdirSync(path.join(dir, ".agents", "skills", "not-a-skill"), { recursive: true });
    const found = h.inProject(dir, "console.log(JSON.stringify(cli.discoverSkills()))");
    assert.deepEqual(found.skills.map((s) => s.name), ["nameless"]);
  });

  test("the workspace note and summary report skills", { skip: h.skipWithoutPython() }, () => {
    const dir = h.makeProject();
    h.fixtureSkill(dir, ".agents/skills", "grill-me");
    h.fixtureSkill(dir, ".claude/skills", "grill-me", { link: ".agents/skills" });
    h.linkDir(path.join(dir, ".claude", "skills", "gone"), path.join(dir, ".agents", "skills", "gone"));

    const result = h.pty(dir, "wait:Which environments;send:enter;wait:Done");
    assert.equal(result.exit, 0, result.out);
    assert.match(result.out, /Skills\s+1 installed · grill-me · 1 broken link/);
    assert.match(result.out, /skills\s+1 preserved/);
  });

  test("--agents lists every visible agent with its skills folder", () => {
    const dir = h.makeProject();
    const home = h.makeHome(["claude-code", "codex"]);
    const result = h.run(dir, ["--agents"], { home });
    assert.equal(result.code, 0);
    assert.match(result.out, /76 supported agents/);
    for (const agent of h.cli.agentRegistry) {
      if (agent.hidden) continue;
      assert.ok(result.out.includes(agent.name), agent.name);
      assert.ok(result.out.includes(`${agent.skillsDir}/`), agent.skillsDir);
    }
    assert.match(result.out, /Claude Code\s+\.claude\/skills\/\s+detected/);
    assert.match(result.out, /Codex\s+\.agents\/skills\/\s+detected/);
    assert.doesNotMatch(result.out, /Cursor\s+\.agents\/skills\/\s+detected/);
    for (const name of h.pointerNames) assert.ok(result.out.includes(name), name);
  });

  test("agent detection honours override variables and project markers", () => {
    const dir = h.makeProject();
    const home = h.makeHome(["cursor"]);
    const custom = h.makeProject({ git: false, name: "claude-elsewhere" });

    const detected = h.inProject(dir, "console.log(JSON.stringify(cli.detectedAgents().map(a => a.id)))", {
      home,
      extra: { CLAUDE_CONFIG_DIR: custom },
    });
    assert.deepEqual(detected, ["claude-code", "cursor"]);

    fs.writeFileSync(path.join(dir, ".replit"), "");
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: { eve: "1.0.0" } }));
    const withProject = h.inProject(dir, "console.log(JSON.stringify(cli.detectedAgents().map(a => a.id)))", { home });
    assert.deepEqual(withProject, ["cursor", "eve", "replit"]);
  });
});

describe("platform", () => {
  test("windows: junctions the way skills creates them are discovered, reported when dangling, and preserved", { skip: process.platform !== "win32" && "junctions are a Windows feature" }, () => {
    const dir = h.makeProject();
    h.fixtureSkill(dir, ".agents/skills", "alpha");
    const link = h.linkDir(path.join(dir, ".claude", "skills", "alpha"), path.join(dir, ".agents", "skills", "alpha"));
    h.linkDir(path.join(dir, ".claude", "skills", "gone"), path.join(dir, ".agents", "skills", "gone"));

    const found = h.inProject(dir, "console.log(JSON.stringify(cli.discoverSkills()))");
    assert.deepEqual(found.skills.map((s) => s.name), ["alpha"]);
    assert.ok(found.skills[0].agents.includes("Claude Code"));
    assert.deepEqual(found.broken, [{ name: "gone", folder: ".claude/skills" }]);

    const before = h.skillsView(h.snapshot(dir));
    const result = h.run(dir, ["--claude"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /skills\s+1 preserved/);
    h.assertSameMap(assert, h.skillsView(h.snapshot(dir)), before, "junctions");
    assert.ok(fs.lstatSync(link).isSymbolicLink());
    assert.equal(path.relative(path.resolve(h.linkTarget(link)), path.join(dir, ".agents", "skills", "alpha")), "");
  });

  test("config/ markers resolve under ~/.config on every platform, as skills does", () => {
    const dir = h.makeProject();
    const home = h.makeHome(["opencode", "goose"]);
    const detected = h.inProject(dir, "console.log(JSON.stringify(cli.detectedAgents().map(a => a.id)))", {
      home,
      omit: ["XDG_CONFIG_HOME"],
    });
    assert.deepEqual(detected, ["goose", "opencode"]);
  });
});
