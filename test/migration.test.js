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
      assert.ok(!h.exists(path.join(dir, ".agents", flat)), `${flat} left behind`);
      // The flat README indexes files that moved; the live one is regenerated.
      if (flat === "README.md") continue;
      assert.equal(h.read(h.handoff(dir, ...destination.split("/"))), contents[flat], destination);
    }
    assert.equal(h.read(h.handoff(dir, "README.md")), h.cli.agentFiles["README.md"]);
    assert.match(result.out, /Your customised \.agents\/README\.md is in that copy/);
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

describe("flat layout: README and occupied destinations", () => {
  const stockFlatReadme = h.cli.legacyHandoffReadmes[1];

  test("a stock flat README is replaced by the current one, silently", () => {
    const dir = h.makeProject();
    seedFlat(dir);
    h.write(path.join(dir, ".agents", "README.md"), stockFlatReadme);

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.equal(h.read(h.handoff(dir, "README.md")), h.cli.agentFiles["README.md"]);
    assert.doesNotMatch(result.out, /Your customised/);
    const snapshot = fs.readdirSync(h.handoff(dir, "archive")).find((n) => n.endsWith("-pre-handoff-migration"));
    assert.equal(h.read(h.handoff(dir, "archive", snapshot, "README.md")), stockFlatReadme);
  });

  test("every flat README agent-sesh shipped is recognised", () => {
    for (const readme of h.cli.legacyHandoffReadmes.slice(1)) {
      const dir = h.makeProject();
      seedFlat(dir);
      h.write(path.join(dir, ".agents", "README.md"), readme.replace(/\n/g, "\r\n"));
      const result = h.run(dir, ["--uni"]);
      assert.equal(result.code, 0, result.out);
      assert.doesNotMatch(result.out, /Your customised/);
    }
  });

  test("the flat README gives way even when a handoff README already exists", () => {
    const dir = h.makeProject();
    seedFlat(dir);
    h.write(path.join(dir, ".agents", "README.md"), stockFlatReadme);
    h.write(h.handoff(dir, "README.md"), "# my own handoff readme\n");

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.ok(!h.exists(path.join(dir, ".agents", "README.md")));
    assert.equal(h.read(h.handoff(dir, "README.md")), "# my own handoff readme\n");
    assert.doesNotMatch(result.out, /left in place/);
  });

  test("someone else's lone .agents/README.md is not ours to move", () => {
    const dir = h.makeProject();
    h.fixtureSkill(dir, ".agents/skills", "keep-me");
    h.write(path.join(dir, ".agents", "README.md"), "# Our skills\n\nteam notes\n");

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.doesNotMatch(result.out, /migrated/);
    assert.equal(h.read(path.join(dir, ".agents", "README.md")), "# Our skills\n\nteam notes\n");
    assert.equal(h.read(h.handoff(dir, "README.md")), h.cli.agentFiles["README.md"]);
  });

  test("a lone stock flat README is still recognised and retired", () => {
    const dir = h.makeProject();
    h.write(path.join(dir, ".agents", "README.md"), stockFlatReadme);

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.ok(!h.exists(path.join(dir, ".agents", "README.md")));
    assert.equal(h.read(h.handoff(dir, "README.md")), h.cli.agentFiles["README.md"]);
  });

  test("context.md replaces an untouched overview.md template (old and current)", () => {
    for (const blank of [h.cli.agentFiles["references/overview.md"], h.cli.agentFileBodies["references/overview.md"]]) {
      const dir = h.makeProject();
      const contents = seedFlat(dir);
      h.write(h.handoff(dir, "references", "overview.md"), blank);
      h.write(h.handoff(dir, "memory", "state.md"), h.cli.agentFileBodies["memory/state.md"]);

      const result = h.run(dir, ["--uni"]);
      assert.equal(result.code, 0, result.out);
      assert.doesNotMatch(result.out, /left in place/);
      assert.equal(h.read(h.handoff(dir, "references", "overview.md")), contents["context.md"]);
      assert.equal(h.read(h.handoff(dir, "memory", "state.md")), contents["state.md"]);
      assert.ok(!h.exists(path.join(dir, ".agents", "context.md")));
      assert.ok(!h.exists(path.join(dir, ".agents", "state.md")));
    }
  });

  test("an identical file at the destination is not a conflict", () => {
    const dir = h.makeProject();
    const contents = seedFlat(dir);
    h.write(h.handoff(dir, "memory", "tasks.md"), contents["tasks.md"]);

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.doesNotMatch(result.out, /left in place/);
    assert.ok(!h.exists(path.join(dir, ".agents", "tasks.md")));
    assert.equal(h.read(h.handoff(dir, "memory", "tasks.md")), contents["tasks.md"]);
  });

  test("an edited template at the destination is still a conflict", () => {
    const dir = h.makeProject();
    seedFlat(dir);
    const edited = `${h.cli.agentFiles["references/overview.md"]}\nsomething the user wrote\n`;
    h.write(h.handoff(dir, "references", "overview.md"), edited);

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /\.agents\/context\.md\n\s+→ \.agents\/handoff\/references\/overview\.md/);
    assert.equal(h.read(h.handoff(dir, "references", "overview.md")), edited);
    assert.ok(h.exists(path.join(dir, ".agents", "context.md")));
  });
});

describe("fixed-layout rule", () => {
  test("the README, the pointer and every template carry it", () => {
    const dir = h.makeProject();
    const result = h.run(dir, ["--uni", "--claude"]);
    assert.equal(result.code, 0, result.out);

    assert.match(h.read(h.handoff(dir, "README.md")), /## Fixed Layout — Do Not Rename, Move Or Delete/);
    for (const name of ["AGENTS.md", "CLAUDE.md"]) {
      assert.match(h.read(path.join(dir, name)), /Never rename, move, or delete any folder or file inside `\.agents\/handoff\/`/);
    }
    for (const relativePath of Object.keys(h.cli.agentFiles).filter((p) => p !== "README.md")) {
      assert.ok(
        h.read(h.handoff(dir, ...relativePath.split("/"))).startsWith(`${h.cli.handoffFileNotice}\n\n# `),
        relativePath,
      );
    }
  });

  test("untouched 1.1.x files are upgraded; edited ones are left alone", () => {
    const dir = h.makeProject();
    for (const [relativePath, body] of Object.entries(h.cli.agentFileBodies)) {
      const old = relativePath === "README.md" ? h.cli.legacyHandoffReadmes[0] : body;
      h.write(h.handoff(dir, ...relativePath.split("/")), old);
    }
    const edited = `${h.cli.agentFileBodies["memory/state.md"]}\n- real state\n`;
    h.write(h.handoff(dir, "memory", "state.md"), edited);
    h.write(h.handoff(dir, "archive", "README.md"), h.cli.legacyArchiveReadme);
    h.write(path.join(dir, "AGENTS.md"), h.cli.legacyPointerTemplates[0]);

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /ready \(15 existing, 0 created, 14 template\(s\) updated\)/);
    for (const [relativePath, content] of Object.entries(h.cli.agentFiles)) {
      if (relativePath === "memory/state.md") continue;
      assert.equal(h.read(h.handoff(dir, ...relativePath.split("/"))), content, relativePath);
    }
    assert.equal(h.read(h.handoff(dir, "memory", "state.md")), edited);
    assert.match(h.read(h.handoff(dir, "archive", "README.md")), /Do not rename, move or delete this folder/);
    assert.equal(h.read(path.join(dir, "AGENTS.md")), h.templateFor("AGENTS.md"));
    assert.match(result.out, /AGENTS\.md\s+recreated \(previous file was an unmodified template\)/);

    const again = h.run(dir, ["--uni"]);
    assert.match(again.out, /ready \(15 existing, 0 created\)/);
  });

  test("a customised handoff README is never rewritten", () => {
    const dir = h.makeProject();
    h.run(dir, ["--uni"]);
    h.write(h.handoff(dir, "README.md"), "# mine\n");
    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.equal(h.read(h.handoff(dir, "README.md")), "# mine\n");
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
