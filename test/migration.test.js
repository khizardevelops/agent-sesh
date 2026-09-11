"use strict";

// Upgrades from the layouts earlier versions wrote: the flat `.agents/*.md`
// of 1.0.x and the interim `context/` + `reference/` folders of the first
// 1.1.0 builds. Nothing is deleted, nothing is overwritten, and skills next
// door are never candidates.

const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const h = require("./helpers");

after(h.cleanup);

const flatMap = h.cli.legacyLayoutMap;
const interimMap = h.cli.interimLayoutMap;
const legacyPointer = h.cli.legacyPointerTemplates[h.cli.legacyPointerTemplates.length - 1];

function seedFlat(dir, { pointer = legacyPointer } = {}) {
  const agents = path.join(dir, ".agents");
  const contents = {};
  for (const flat of Object.keys(flatMap)) {
    contents[flat] = `# ${flat}\n\nreal content for ${flat}\n`;
    h.write(path.join(agents, flat), contents[flat]);
  }
  h.write(path.join(agents, "archive", "2025-01-01T00-00-00+00-00", "manifest.json"), "{}\n");
  h.write(path.join(agents, "archive", "2025-01-01T00-00-00+00-00", "state.md"), "old state\n");
  h.write(path.join(agents, "old_agent_files", "agents", "OLD_AGENTS_1.md"), "very old\n");
  h.write(path.join(agents, "custom", "notes.md"), "custom notes\n");
  h.write(path.join(dir, "AGENTS.md"), pointer);
  fs.chmodSync(path.join(dir, "AGENTS.md"), 0o444);
  return contents;
}

describe("flat 1.0.x layout", () => {
  test("every file lands in its new home byte-identical, with a snapshot and no deletions", () => {
    const dir = h.makeProject();
    h.fixtureSkill(dir, ".agents/skills", "keep-me");
    const skillsBefore = h.skillsView(h.snapshot(dir));
    const contents = seedFlat(dir);

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /migrated\s+18 item\(s\) moved in/);
    assert.match(result.out, /A copy of the previous layout is in/);

    for (const [flat, destination] of Object.entries(flatMap)) {
      assert.equal(h.read(h.handoff(dir, ...destination.split("/"))), contents[flat], destination);
      assert.ok(!h.exists(path.join(dir, ".agents", flat)), `${flat} left behind`);
    }
    assert.equal(h.read(h.handoff(dir, "archive", "2025-01-01T00-00-00+00-00", "state.md")), "old state\n");
    assert.equal(h.read(h.handoff(dir, "old_agent_files", "agents", "OLD_AGENTS_1.md")), "very old\n");
    assert.equal(h.read(h.handoff(dir, "custom", "notes.md")), "custom notes\n");
    for (const legacy of ["archive", "old_agent_files", "custom"]) {
      assert.ok(!h.exists(path.join(dir, ".agents", legacy)), legacy);
    }

    const snapshots = fs.readdirSync(h.handoff(dir, "archive")).filter((n) => n.endsWith("-pre-handoff-migration"));
    assert.equal(snapshots.length, 1);
    const copied = fs.readdirSync(h.handoff(dir, "archive", snapshots[0])).filter((n) => n.endsWith(".md"));
    assert.equal(copied.length, Object.keys(flatMap).length);
    const manifest = JSON.parse(h.read(h.handoff(dir, "archive", snapshots[0], "manifest.json")));
    assert.equal(manifest.migration.renames["context.md"], "references/overview.md");

    // The 1.0.10 pointer is a stock template: rewritten, not backed up.
    assert.equal(h.read(path.join(dir, "AGENTS.md")), h.templateFor("AGENTS.md"));
    assert.ok(!h.exists(h.handoff(dir, "old_agent_files", "agents", "OLD_AGENTS_2.md")));

    h.assertSameMap(assert, h.skillsView(h.snapshot(dir)), skillsBefore, "skills beside the flat layout");
    assert.deepEqual(fs.readdirSync(path.join(dir, ".agents")).sort(), ["handoff", "skills"]);

    const again = h.run(dir, ["--uni"]);
    assert.doesNotMatch(again.out, /migrated/);
    assert.equal(fs.readdirSync(h.handoff(dir, "archive")).filter((n) => n.endsWith("-pre-handoff-migration")).length, 1);
  });

  test("a customised 1.0.x pointer is rewritten, backed up, and the reason is explained", () => {
    const dir = h.makeProject();
    // A 1.0.x customisation points at `.agents/`, never at `.agents/handoff/`.
    const custom = h.customPointer("AGENTS.md", undefined, { foreign: true });
    custom.content += "\nRead `.agents/README.md` before anything else.\n";
    seedFlat(dir, { pointer: custom.content });

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /AGENTS\.md had custom content and was rewritten:\nthe paths inside it moved into \.agents\/handoff\//);
    assert.match(result.out, /Your version is kept as OLD_AGENTS_2\.md/);
    assert.deepEqual(h.findSentinel(dir, custom.sentinel), [".agents/handoff/old_agent_files/agents/OLD_AGENTS_2.md"]);
  });

  test("occupied destinations are left alone and reported once", () => {
    const dir = h.makeProject();
    seedFlat(dir);
    h.write(h.handoff(dir, "memory", "state.md"), "already here\n");
    h.write(h.handoff(dir, "rules", "style.md"), "already here too\n");

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /2 file\(s\) were left in place because their new location already exists/);
    assert.equal(result.out.split("were left in place").length, 2, "one aggregated warning");
    assert.equal(h.read(h.handoff(dir, "memory", "state.md")), "already here\n");
    assert.equal(h.read(path.join(dir, ".agents", "state.md")), "# state.md\n\nreal content for state.md\n");
    assert.equal(h.read(path.join(dir, ".agents", "style.md")), "# style.md\n\nreal content for style.md\n");
  });

  test("colliding legacy backup numbers are renumbered, identical ones dropped", () => {
    const dir = h.makeProject();
    seedFlat(dir);
    h.write(h.handoff(dir, "old_agent_files", "agents", "OLD_AGENTS_1.md"), "newer one\n");
    h.write(path.join(dir, ".agents", "old_agent_files", "agents", "OLD_AGENTS_2.md"), "newer one\n");

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    const files = fs.readdirSync(h.handoff(dir, "old_agent_files", "agents")).filter((n) => n.startsWith("OLD_")).sort();
    assert.deepEqual(files, ["OLD_AGENTS_1.md", "OLD_AGENTS_2.md"]);
    assert.equal(h.read(h.handoff(dir, "old_agent_files", "agents", "OLD_AGENTS_2.md")), "very old\n");
    assert.ok(!h.exists(path.join(dir, ".agents", "old_agent_files")));
  });
});

describe("interim 1.1.0 layout", () => {
  test("context/ and reference/ fold forward and the emptied folders go", () => {
    const dir = h.makeProject();
    const contents = {};
    for (const source of Object.keys(interimMap)) {
      contents[source] = `# ${source}\n\ninterim ${source}\n`;
      h.write(h.handoff(dir, ...source.split("/")), contents[source]);
    }
    h.write(h.handoff(dir, "README.md"), "# readme\n");
    h.write(h.handoff(dir, "memory", "state.md"), "# state\n");
    h.write(path.join(dir, "AGENTS.md"), h.cli.legacyPointerTemplates[1]);

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /migrated\s+9 item\(s\) moved in/);
    for (const [source, destination] of Object.entries(interimMap)) {
      assert.equal(h.read(h.handoff(dir, ...destination.split("/"))), contents[source], destination);
    }
    assert.ok(!h.exists(h.handoff(dir, "context")));
    assert.ok(!h.exists(h.handoff(dir, "reference")));
    assert.ok(!h.exists(h.handoff(dir, "old_agent_files")), "interim pointer is a recognised template");
    assert.ok(!h.exists(h.handoff(dir, "archive")), "no snapshot for an in-place fold");
    // 9 folded + README + memory/state.md were there; the other 4 memory
    // templates were never seeded, so they are created.
    assert.match(result.out, /ready \(4 created, 11 existing\)/);
    assert.match(result.out, /AGENTS\.md\s+recreated \(previous file was an unmodified template\)/);
  });

  test("a conflict inside the interim fold keeps the source file and its folder", () => {
    const dir = h.makeProject();
    h.write(h.handoff(dir, "context", "glossary.md"), "interim glossary\n");
    h.write(h.handoff(dir, "references", "glossary.md"), "already migrated\n");

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /\.agents\/handoff\/context\/glossary\.md\n\s+→ \.agents\/handoff\/references\/glossary\.md/);
    assert.equal(h.read(h.handoff(dir, "context", "glossary.md")), "interim glossary\n");
    assert.equal(h.read(h.handoff(dir, "references", "glossary.md")), "already migrated\n");
  });
});
