"use strict";

// The planning backlog in docs/planning/: the one thing agent-sesh writes
// outside .agents/ and the pointer files. Every state docs/ can be in, by flag
// and through the prompts, and the two promises that hold in all of them:
// docs/ is written to only in a run that asked for it, and only ever added to.

const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const h = require("./helpers");

after(h.cleanup);

const ours = Object.keys(h.cli.planningFiles);
const planning = (dir, ...rest) => path.join(dir, "docs", "planning", ...rest);
const docsView = (dir) =>
  new Map([...h.snapshot(dir)].filter(([relative]) => /^docs(\/|$)/i.test(relative)));

// Every path under docs/ that existed before is still there, byte for byte.
function assertNothingOfYoursChanged(before, afterSnap, label) {
  const changed = [...before].filter(([k, v]) => afterSnap.get(k) !== v).map(([k]) => k);
  assert.deepEqual(changed, [], `${label}: changed or removed ${JSON.stringify(changed)}`);
}

function assertTemplates(dir, relativePaths) {
  for (const relative of relativePaths) {
    assert.equal(h.read(planning(dir, ...relative.split("/"))), h.cli.planningFiles[relative], relative);
  }
}

// A planning folder someone set up by hand, unlike agent-sesh's.
function customSetup(dir) {
  const files = {
    "README.md": "# Our planning\n\nWe use todo.md and roadmap.md. sentinel-readme\n",
    "ideas.md": "# Ideas\n\n- our idea sentinel-ideas\n",
    "todo.md": "- [ ] ship it\n",
    "roadmap.md": "# Roadmap\n",
    "archive/2025.md": "# 2025\n\ndone things\n",
  };
  for (const [relative, content] of Object.entries(files)) h.write(planning(dir, ...relative.split("/")), content);
  return files;
}

describe("--planning, by docs/ state", () => {
  test("no docs/ folder: docs/planning/ is created with the five files and nothing else", () => {
    const dir = h.makeProject();
    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Setting up Universal \(AGENTS\.md\) and a planning backlog in docs\/planning\//);
    assert.match(r.out, /docs\/planning\/\s+5 files created/);
    assert.deepEqual(fs.readdirSync(path.join(dir, "docs")), ["planning"]);
    assert.deepEqual(fs.readdirSync(planning(dir)).sort(), ["README.md", "archive", "bugs.md", "ideas.md"]);
    assert.deepEqual(fs.readdirSync(planning(dir, "archive")).sort(), ["bugs.md", "ideas.md"]);
    assertTemplates(dir, ours);
    // The backlog is the user's to edit: no protection, unlike the pointers.
    for (const relative of ours) assert.equal(h.mode(planning(dir, ...relative.split("/"))) & 0o200, 0o200, relative);
    assert.ok(h.exists(h.handoff(dir, "README.md")), "the brain is set up in the same run");
  });

  test("docs/ exists: planning/ is added inside it and nothing else in docs/ changes", () => {
    const dir = h.makeProject();
    h.write(path.join(dir, "docs", "README.md"), "# Our docs\n");
    h.write(path.join(dir, "docs", "guide", "setup.md"), "# Setup\n");
    h.write(path.join(dir, "docs", "archive", "old.md"), "# old\n");
    const before = docsView(dir);

    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /docs\/planning\/\s+5 files created/);
    assertNothingOfYoursChanged(before, docsView(dir), "existing docs/");
    assertTemplates(dir, ours);
    const added = [...docsView(dir).keys()].filter((k) => !before.has(k));
    assert.deepEqual(added.sort(), ["docs/planning/", "docs/planning/README.md", "docs/planning/archive/", "docs/planning/archive/bugs.md", "docs/planning/archive/ideas.md", "docs/planning/bugs.md", "docs/planning/ideas.md"]);
  });

  test("docs/planning/ exists but is empty: the five files go in it", () => {
    const dir = h.makeProject();
    fs.mkdirSync(planning(dir), { recursive: true });
    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /docs\/planning\/\s+5 files created/);
    assertTemplates(dir, ours);
  });

  test("agent-sesh's backlog, filled in and partly deleted: the gaps are refilled, the rest is kept", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--planning"]).code, 0);
    h.write(planning(dir, "ideas.md"), "# Ideas & Todo\n\n- [ ] **Mine.** sentinel\n");
    fs.rmSync(planning(dir, "archive"), { recursive: true });
    const before = docsView(dir);

    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /docs\/planning\/\s+ready \(2 created, 3 existing\)/);
    assertNothingOfYoursChanged(before, docsView(dir), "filled backlog");
    assert.equal(h.read(planning(dir, "ideas.md")), "# Ideas & Todo\n\n- [ ] **Mine.** sentinel\n");
    assertTemplates(dir, ["archive/ideas.md", "archive/bugs.md"]);
    assert.match(r.out, /already had 1 of these files[\s\S]*\n  ideas\.md\n/);
  });

  test("a custom planning setup: every file of yours stays, ours are only added beside them", () => {
    const dir = h.makeProject();
    const theirs = customSetup(dir);
    const before = docsView(dir);

    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    assertNothingOfYoursChanged(before, docsView(dir), "custom setup");
    for (const [relative, content] of Object.entries(theirs)) {
      assert.equal(h.read(planning(dir, ...relative.split("/"))), content, relative);
    }
    // Nothing archived, moved or renamed out of the way.
    assert.ok(!h.exists(path.join(dir, "docs", "archive")));
    assert.ok(!fs.readdirSync(planning(dir)).some((name) => /agent-sesh|\.bak|OLD_/i.test(name)));
    assertTemplates(dir, ["bugs.md", "archive/ideas.md", "archive/bugs.md"]);
    assert.match(r.out, /docs\/planning\/\s+ready \(3 created, 2 existing\)/);
    assert.match(r.out, /already had 2 of these files\. They were kept\nexactly as they are, and agent-sesh's versions were not written:\n  README\.md\n  ideas\.md\n/);
    assert.match(r.out, /run npx agent-sesh --planning in an empty folder/);
  });

  test("a custom setup that already uses all five names: nothing is written", () => {
    const dir = h.makeProject();
    for (const relative of ours) h.write(planning(dir, ...relative.split("/")), `# mine ${relative}\n`);
    const before = docsView(dir);

    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    h.assertSameMap(assert, docsView(dir), before, "all names taken");
    assert.match(r.out, /docs\/planning\/\s+ready \(5 existing, 0 created\)/);
    assert.doesNotMatch(r.out, /already had/);
  });

  test("running --planning twice changes nothing the second time", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--planning"]).code, 0);
    const before = h.snapshot(dir);
    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /docs\/planning\/\s+ready \(5 existing, 0 created\)/);
    h.assertSameMap(assert, h.snapshot(dir), before, "second --planning run");
  });
});

describe("--planning, when docs/ is in the way", () => {
  test("docs is a file: the backlog is skipped with a warning, the rest of the run completes", () => {
    const dir = h.makeProject();
    h.write(path.join(dir, "docs"), "not a folder\n");
    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /docs\/planning\/\s+not added \(see below\)/);
    assert.match(r.out, /docs exists but is not a folder, so the planning backlog was not added\./);
    assert.equal(h.read(path.join(dir, "docs")), "not a folder\n");
    assert.ok(h.exists(path.join(dir, "AGENTS.md")));
    assert.ok(h.exists(h.handoff(dir, "README.md")));
  });

  test("docs/planning is a file: the same", () => {
    const dir = h.makeProject();
    h.write(planning(dir), "a file\n");
    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /docs\/planning exists but is not a folder/);
    assert.equal(h.read(planning(dir)), "a file\n");
  });

  test("docs/planning/archive is a file: the three active files are added, the archive ones are not", () => {
    const dir = h.makeProject();
    h.write(planning(dir, "archive"), "a file\n");
    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /docs\/planning\/\s+ready \(3 created, 0 existing\) · 2 not added/);
    assert.match(r.out, /2 planning file\(s\) were not added:\n  docs\/planning\/archive\/ideas\.md — docs\/planning\/archive is not a folder/);
    assertTemplates(dir, ["README.md", "ideas.md", "bugs.md"]);
    assert.equal(h.read(planning(dir, "archive")), "a file\n");
  });

  test("a dangling symlink in place of one of the files is never written through", { skip: h.skipWithoutSymlinks() }, () => {
    const dir = h.makeProject();
    fs.mkdirSync(planning(dir), { recursive: true });
    const outside = path.join(dir, "outside-target.md");
    fs.symlinkSync(outside, planning(dir, "ideas.md"));
    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    assert.ok(!h.exists(outside), "wrote through the symlink");
    assert.ok(fs.lstatSync(planning(dir, "ideas.md")).isSymbolicLink());
    assert.match(r.out, /docs\/planning\/\s+ready \(4 created, 1 existing\)/);
  });

  test("an existing Docs/ folder is used rather than a second docs/ beside it", (t) => {
    const probe = h.makeProject({ git: false, name: "probe" });
    fs.writeFileSync(path.join(probe, "a"), "");
    if (h.exists(path.join(probe, "A"))) {
      t.skip("case-insensitive filesystem: docs/ and Docs/ are one folder here");
      return;
    }

    const dir = h.makeProject();
    h.write(path.join(dir, "Docs", "index.md"), "# Docs\n");
    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Docs\/planning\/\s+5 files created/);
    assert.ok(!h.exists(path.join(dir, "docs")), "created docs/ beside Docs/");
    assert.match(h.read(path.join(dir, "Docs", "planning", "README.md")), /Docs\/planning\/ideas\.md {3}->/);
  });
});

describe("docs/ is written to only when asked", () => {
  test("a run without --planning never creates docs/, and leaves an existing one alone", () => {
    const fresh = h.makeProject();
    for (const action of [["--uni"], ["--claude", "--gemini"], []]) {
      assert.equal(h.run(fresh, action).code, 0);
      assert.ok(!h.exists(path.join(fresh, "docs")), `${action.join(" ")} created docs/`);
    }

    // A half-built backlog is not topped up unasked.
    const partial = h.makeProject();
    assert.equal(h.run(partial, ["--planning"]).code, 0);
    fs.rmSync(planning(partial, "bugs.md"));
    const before = docsView(partial);
    const r = h.run(partial, ["--uni"]);
    assert.equal(r.code, 0, r.out);
    h.assertSameMap(assert, docsView(partial), before, "--uni on a partial backlog");
    assert.doesNotMatch(r.out, /docs\/planning/);
  });

  test("--planning on its own keeps the pointers the project already has", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--claude", "--gemini"]).code, 0);
    const r = h.run(dir, ["--planning"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Adding a planning backlog in docs\/planning\/, keeping Claude Code \(CLAUDE\.md\) and Gemini CLI \(GEMINI\.md\)/);
    assert.deepEqual(h.pointerNames.filter((name) => h.exists(path.join(dir, name))), ["CLAUDE.md", "GEMINI.md"]);
    assert.doesNotMatch(r.out, /retired/);
    assert.match(r.out, /docs\/planning\/\s+5 files created/);
  });

  test("--planning combines with environment flags", () => {
    const dir = h.makeProject();
    const r = h.run(dir, ["--claude", "--planning"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Setting up Claude Code \(CLAUDE\.md\) and a planning backlog in docs\/planning\//);
    assert.deepEqual(h.pointerNames.filter((name) => h.exists(path.join(dir, name))), ["CLAUDE.md"]);
    assertTemplates(dir, ours);
  });

  test("the guard refuses docs/ unless the run asked for the backlog", () => {
    const dir = h.makeProject();
    const cases = [
      ["docs/planning/README.md", {}],
      ["docs/planning", {}],
      ["docs/README.md", {}],
      ["docs", {}],
    ];
    const verdicts = h.inProject(
      dir,
      `console.log(JSON.stringify(${JSON.stringify(cases)}.map(([p, o]) => cli.isOwnedPath(p, o))))`,
    );
    assert.deepEqual(verdicts, cases.map(() => false));
  });

  test("a --planning run changes nothing outside its own paths and docs/planning/", () => {
    const dir = h.makeProject();
    h.fixtureSkill(dir, ".agents/skills", "x");
    h.write(path.join(dir, "docs", "README.md"), "# docs\n");
    h.write(path.join(dir, "README.md"), "# project\n");
    const before = h.snapshot(dir);

    const r = h.run(dir, ["--uni", "--planning"]);
    assert.equal(r.code, 0, r.out);
    const afterSnap = h.snapshot(dir);
    const touched = [...afterSnap].filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
    const outside = touched.filter(
      (k) => !k.startsWith(".agents/handoff") && !k.startsWith("docs/planning/") && !h.pointerNames.includes(k),
    );
    assert.deepEqual(outside, [], "paths changed outside agent-sesh's own");
    assert.deepEqual([...before].filter(([k]) => !afterSnap.has(k)).map(([k]) => k), [], "nothing removed");
  });
});

describe("the templates and the brain agree", () => {
  test("every .agents/handoff/ path the planning templates name is a file agent-sesh writes", () => {
    const named = new Set();
    for (const body of Object.values(h.cli.planningFiles)) {
      for (const match of body.matchAll(/\.agents\/handoff\/([\w/-]+\.md)/g)) named.add(match[1]);
    }
    assert.ok(named.size >= 4, [...named].join(", "));
    for (const relative of named) assert.ok(h.cli.agentFiles[relative], `${relative} is not a brain file`);
  });

  test("the handoff README tells agents about docs/planning/", () => {
    assert.match(h.cli.agentFiles["README.md"], /## Planning Backlog\n\nIf the project has `docs\/planning\/`/);
  });

  test("an untouched 1.2.0 handoff README is brought up to date; an edited one is not", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--uni"]).code, 0);
    h.write(h.handoff(dir, "README.md"), h.cli.legacyHandoffReadmes[0]);
    const r = h.run(dir, ["--uni"]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /1 template\(s\) updated/);
    assert.equal(h.read(h.handoff(dir, "README.md")), h.cli.agentFiles["README.md"]);

    const edited = `${h.cli.legacyHandoffReadmes[0]}\nMy own note.\n`;
    h.write(h.handoff(dir, "README.md"), edited);
    assert.equal(h.run(dir, ["--uni"]).code, 0);
    assert.equal(h.read(h.handoff(dir, "README.md")), edited);
  });
});

// ── the prompts ───────────────────────────────────────────────────

const skip = h.skipWithoutPython();

function assertFits(out, cols = 80) {
  const printed = out
    .split("\n")
    .filter((line) => /^[│◇└┌├]/.test(line))
    .filter((line) => !/[◻◼○●◆]|↑\/↓|Space:/.test(line));
  const longest = Math.max(0, ...printed.map((line) => [...line].length));
  assert.ok(longest <= cols, `a line is ${longest} columns wide:\n${printed.find((l) => [...l].length === longest)}`);
}

const QUESTION = "wait:Which environments do you want to set up;send:enter;wait:Add a planning backlog in docs/planning/?";

describe("setup question on a new project", { skip }, () => {
  test("no docs/: the box says docs/ will be created, and Enter adds the backlog", () => {
    const dir = h.makeProject();
    const r = h.pty(dir, `${QUESTION};wait:There is no docs/;send:enter;wait:Done`);
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /┌ 📋 Yes — add docs\/planning\/\n│  │ A backlog that outlives sessions\./);
    assert.match(r.out, /There is no docs\/ folder yet, so agent-sesh\s+(│  │ )?creates it/);
    assert.match(r.out, /● 📋 Yes — add docs\/planning\/\n│  ○ ➖ No — leave docs\/ alone/);
    assertTemplates(dir, ours);
    assertFits(r.out);
  });

  test("docs/ exists: the row and the box say planning/ goes inside it", () => {
    const dir = h.makeProject();
    h.write(path.join(dir, "docs", "intro.md"), "# Intro\n");
    const before = docsView(dir);
    const r = h.pty(dir, `${QUESTION};wait:already exists;send:enter;wait:Done`);
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /Planning\s+not set up yet · docs\/ exists/);
    assert.match(r.out, /docs\/ already exists, so planning\/ is added\s+(│  │ )?inside it/);
    assertNothingOfYoursChanged(before, docsView(dir), "interactive, docs/ exists");
    assertTemplates(dir, ours);
  });

  test("a custom setup: the box names what is added and what is kept", () => {
    const dir = h.makeProject();
    customSetup(dir);
    const before = docsView(dir);
    const r = h.pty(dir, `${QUESTION};wait:Everything already there;send:enter;wait:Done`);
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /Planning\s+docs\/planning\/ · 2\/5 files · \+3 of your own/);
    const box = r.out.replace(/\n│  │ /g, " ");
    assert.match(box, /only the missing files are added: bugs\.md, archive\/ideas\.md, archive\/bugs\.md\./);
    assert.match(box, /Everything already there \(README\.md, ideas\.md\) is kept exactly as it is: never overwritten, moved or archived\./);
    assertNothingOfYoursChanged(before, docsView(dir), "interactive custom setup");
    assert.match(r.out, /kept\n│  exactly as they are/);
    assertFits(r.out);
  });

  test("No writes nothing to docs/; a complete backlog is not asked about at all", () => {
    const declined = h.makeProject();
    h.write(path.join(declined, "docs", "intro.md"), "# Intro\n");
    const before = docsView(declined);
    const r = h.pty(declined, `${QUESTION};send:down;wait:Nothing is written to docs/;send:enter;wait:Done`);
    assert.equal(r.exit, 0, r.out);
    h.assertSameMap(assert, docsView(declined), before, "declined");
    assert.doesNotMatch(r.out, /Track open ideas/);

    const complete = h.makeProject();
    for (const relative of ours) h.write(planning(complete, ...relative.split("/")), `# mine ${relative}\n`);
    const r2 = h.pty(complete, "wait:Which environments do you want to set up;send:enter;wait:Done");
    assert.equal(r2.exit, 0, r2.out);
    assert.doesNotMatch(r2.out, /Add a planning backlog/);
    assert.match(r2.out, /Planning\s+docs\/planning\/ · 5 files/);
  });

  test("cancelling at the question writes nothing", () => {
    const dir = h.makeProject();
    const r = h.pty(dir, `${QUESTION};send:ctrlc`);
    assert.equal(r.exit, 130, r.out);
    assert.deepEqual(fs.readdirSync(dir).filter((n) => n !== ".git"), []);
  });

  test("the box fits a narrow window", () => {
    const dir = h.makeProject();
    customSetup(dir);
    const r = h.pty(dir, `${QUESTION};send:down;wait:Nothing is written;send:ctrlc`, [], { cols: 50 });
    assert.equal(r.exit, 130, r.out);
    assertFits(r.out, 50);
  });
});

describe("menu entry on an existing project", { skip }, () => {
  const MENU = "wait:What do you want to do";
  const PICK_PLANNING = `${MENU};send:down;send:down;send:down;wait:Add a planning backlog;send:enter;wait:Done`;

  test("listed last; choosing it adds the backlog, keeps the pointers and asks nothing else", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--claude"]).code, 0);
    h.write(h.handoff(dir, "memory", "state.md"), "# State\n\nmine\n");

    const r = h.pty(dir, PICK_PLANNING);
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /○ 🔵 Start over\n│  ● 📋 Add a planning backlog/);
    assert.match(r.out, /Everything Update does happens too\./);
    assert.doesNotMatch(r.out, /Which environments/);
    assert.deepEqual(h.pointerNames.filter((name) => h.exists(path.join(dir, name))), ["CLAUDE.md"]);
    assert.equal(h.read(h.handoff(dir, "memory", "state.md")), "# State\n\nmine\n");
    assertTemplates(dir, ours);
    assert.match(r.out, /docs\/planning\/\s+5 files created/);
    assertFits(r.out);
  });

  test("not offered once nothing is missing", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--uni", "--planning"]).code, 0);
    const r = h.pty(dir, `${MENU};send:ctrlc`);
    assert.equal(r.exit, 130, r.out);
    assert.doesNotMatch(r.out, /Add a planning backlog/);
    assert.match(r.out, /Planning\s+docs\/planning\/ · 5 files/);
  });

  test("Update never writes to docs/, even with a backlog that has gaps", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--uni", "--planning"]).code, 0);
    fs.rmSync(planning(dir, "archive"), { recursive: true });
    const before = docsView(dir);
    const r = h.pty(dir, `${MENU};send:enter;wait:Done`);
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /Planning\s+docs\/planning\/ · 3\/5 files/);
    h.assertSameMap(assert, docsView(dir), before, "Update");
  });

  test("Start over leaves docs/planning/ exactly as it is", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--uni", "--planning"]).code, 0);
    h.write(planning(dir, "ideas.md"), "# Ideas\n\n- [ ] keep me\n");
    const before = docsView(dir);
    const r = h.pty(dir, `${MENU};send:down;send:down;send:enter;wait:Proceed;send:enter;wait:Done`);
    assert.equal(r.exit, 0, r.out);
    h.assertSameMap(assert, docsView(dir), before, "Start over");
    const archives = fs.readdirSync(h.handoff(dir, "archive")).filter((n) => n !== "README.md");
    assert.ok(!h.exists(h.handoff(dir, "archive", archives[0], "docs")), "the snapshot reached docs/");
  });
});
