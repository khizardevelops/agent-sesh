"use strict";

// Brute force: starting states × actions, checking the invariants after
// every run rather than any particular output.
//
// Default: a reduced grid (27 states × 5 actions) that runs in under half a
// minute. AGENT_SESH_MATRIX=full widens it to every pointer pair, every
// content kind, every brain layout and every flag pair — 230 states × 9
// actions, run twice each for idempotency — which takes several minutes.

const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const h = require("./helpers");

after(h.cleanup);

const FULL = process.env.AGENT_SESH_MATRIX === "full";
const names = h.pointerNames;
const flags = names.map(h.flagFor);

// ── starting states ───────────────────────────────────────────────

const pointerSets = FULL
  ? subsets(names).filter((s) => s.length <= 2)
  : [[], ["AGENTS.md"], ["CLAUDE.md"], ["AGENTS.md", "CLAUDE.md"], ["GEMINI.md", "IFLOW.md"]];

const contentKinds = FULL ? ["template", "legacy", "custom"] : ["template", "custom"];

const brainKinds = FULL ? ["none", "fresh", "filled", "flat", "interim"] : ["none", "filled", "flat"];

const skillsKinds = ["everywhere"];

const actions = FULL
  ? [
      ...flags.map((flag) => [flag]),
      ["--uni", "--claude"],
      ["--gemini", "--qwen", "--iflow"],
      flags,
      [],
    ]
  : [["--uni"], ["--claude"], ["--uni", "--claude"], flags, []];

function subsets(items) {
  const out = [[]];
  for (const item of items) out.push(...out.map((s) => [...s, item]));
  return out;
}

function seed(dir, { pointers, content, brain, skills }) {
  const sentinels = {};

  for (const name of pointers) {
    if (content === "template") {
      h.write(path.join(dir, name), h.templateFor(name));
    } else if (content === "legacy") {
      h.write(path.join(dir, name), h.cli.legacyPointerTemplates[h.cli.legacyPointerTemplates.length - 1].replace(/AGENTS\.md/g, name));
    } else {
      const custom = h.customPointer(name);
      sentinels[name] = custom.sentinel;
      h.write(path.join(dir, name), custom.content);
    }
    fs.chmodSync(path.join(dir, name), 0o444);
  }

  if (brain === "fresh") {
    for (const [relative, body] of Object.entries(h.cli.agentFiles)) h.write(h.handoff(dir, ...relative.split("/")), body);
  } else if (brain === "filled") {
    for (const relative of Object.keys(h.cli.agentFiles)) h.write(h.handoff(dir, ...relative.split("/")), `# ${relative}\n\nfilled ${relative}\n`);
  } else if (brain === "flat") {
    for (const flat of Object.keys(h.cli.legacyLayoutMap)) h.write(path.join(dir, ".agents", flat), `# ${flat}\n\nflat ${flat}\n`);
  } else if (brain === "interim") {
    for (const source of Object.keys(h.cli.interimLayoutMap)) h.write(h.handoff(dir, ...source.split("/")), `# ${source}\n\ninterim ${source}\n`);
    h.write(h.handoff(dir, "README.md"), "# readme\n");
  }

  if (skills === "everywhere") {
    h.fixtureSkill(dir, ".agents/skills", "alpha");
    for (const folder of h.skillsFolders()) {
      if (folder !== ".agents/skills") h.fixtureSkill(dir, folder, "alpha", { link: ".agents/skills" });
    }
    h.writeLock(dir, ["alpha"]);
  }

  return sentinels;
}

// ── invariants ────────────────────────────────────────────────────

function checkInvariants(dir, state, action, result, sentinels, skillsBefore) {
  const label = `${JSON.stringify(state)} → ${action.join(" ") || "(no flags)"}\n${result.out}`;
  assert.equal(result.code, 0, label);

  const selected = action.length ? names.filter((n) => action.includes(h.flagFor(n))) : ["AGENTS.md"];
  for (const name of names) {
    const file = path.join(dir, name);
    if (selected.includes(name)) {
      assert.ok(h.exists(file), `${name} missing\n${label}`);
      assert.equal(h.mode(file), 0o444, `${name} not protected\n${label}`);
      assert.ok(h.read(file).includes(`Do not edit this ${name} file`), `${name} talks about another file\n${label}`);
    } else {
      assert.ok(!h.exists(file), `${name} should have been retired\n${label}`);
    }
  }

  // Hand-written content is never lost: it is still a pointer, or a backup.
  for (const [name, sentinel] of Object.entries(sentinels)) {
    const hits = h.findSentinel(dir, sentinel);
    assert.ok(hits.length > 0, `hand-written ${name} vanished\n${label}`);
    assert.ok(
      hits.every((hit) => names.includes(hit) || hit.startsWith(".agents/handoff/old_agent_files/")),
      `hand-written ${name} ended up in ${hits}\n${label}`,
    );
  }

  // The brain is complete and nothing of a previous layout is left behind.
  for (const relative of Object.keys(h.cli.agentFiles)) {
    assert.ok(h.exists(h.handoff(dir, ...relative.split("/"))), `${relative} missing\n${label}`);
  }
  const topLevel = fs.readdirSync(path.join(dir, ".agents")).filter((n) => n !== "handoff" && n !== "skills");
  assert.deepEqual(topLevel, [], `stray entries in .agents/\n${label}`);
  assert.ok(!h.exists(h.handoff(dir, "context")) && !h.exists(h.handoff(dir, "reference")), label);
  if (state.brain === "filled") {
    assert.equal(h.read(h.handoff(dir, "memory", "state.md")), "# memory/state.md\n\nfilled memory/state.md\n", label);
  }
  if (state.brain === "flat") {
    assert.equal(h.read(h.handoff(dir, "references", "overview.md")), "# context.md\n\nflat context.md\n", label);
  }

  if (skillsBefore) {
    h.assertSameMap(assert, h.skillsView(h.snapshot(dir)), skillsBefore, label);
    assert.match(result.out, /skills\s+1 preserved/, label);
  }

  // Backups only ever hold hand-written content.
  const backups = h.handoff(dir, "old_agent_files");
  if (h.exists(backups)) {
    assert.equal(state.content, "custom", `backup folder created for stock templates\n${label}`);
  }
}

// ── the grid ──────────────────────────────────────────────────────

const states = [];
for (const pointers of pointerSets) {
  for (const content of pointers.length ? contentKinds : ["template"]) {
    for (const brain of brainKinds) {
      for (const skills of skillsKinds) states.push({ pointers, content, brain, skills });
    }
  }
}

describe(`matrix: ${states.length} states × ${actions.length} actions`, () => {
  for (const state of states) {
    test(`${state.pointers.join("+") || "no pointers"} · ${state.content} · brain ${state.brain} · skills ${state.skills}`, () => {
      for (const action of actions) {
        const dir = h.makeProject();
        const sentinels = seed(dir, state);
        const skillsBefore = state.skills === "everywhere" ? h.skillsView(h.snapshot(dir)) : null;

        const first = h.run(dir, action);
        checkInvariants(dir, state, action, first, sentinels, skillsBefore);

        // Running the same thing again must be a no-op.
        const afterFirst = h.snapshot(dir);
        const second = h.run(dir, action);
        checkInvariants(dir, state, action, second, sentinels, skillsBefore);
        h.assertSameMap(assert, h.snapshot(dir), afterFirst, `second run changed something: ${action.join(" ")}`);
        assert.doesNotMatch(second.out, /backup\s+/, `second run wrote a backup: ${action.join(" ")}`);
      }
    });
  }
});
