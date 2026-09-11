"use strict";

// The ownership guard: the one place that decides what agent-sesh may write,
// move or remove. Everything skills owns must be refused.

const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const h = require("./helpers");

after(h.cleanup);

function check(dir, cases) {
  return h.inProject(
    dir,
    `console.log(JSON.stringify(${JSON.stringify(cases)}.map(([p, o]) => cli.isOwnedPath(p, o))))`,
  );
}

describe("ownership guard", () => {
  test("writes are confined to handoff/, the pointer files and the hooks directory", () => {
    const dir = h.makeProject();
    const cases = [
      [".agents/handoff/memory/state.md", {}],
      [".agents/handoff", {}],
      [".agents/handoff/archive/2026/manifest.json", {}],
      [".git/hooks/post-merge", {}],
      ...h.pointerNames.map((name) => [name, {}]),
    ];
    assert.deepEqual(check(dir, cases), cases.map(() => true));
  });

  test("every skills folder in the registry is refused, as source and destination", () => {
    const dir = h.makeProject();
    const cases = [];
    for (const folder of h.skillsFolders()) {
      cases.push([`${folder}/x/SKILL.md`, {}], [`${folder}/x`, { asSource: true }], [folder, {}]);
    }
    cases.push([h.cli.skillsLockFileName, {}], [h.cli.skillsLockFileName, { asSource: true }]);
    assert.deepEqual(check(dir, cases), cases.map(() => false));
  });

  test("the project root, .agents/ itself, siblings and parents are refused", () => {
    const dir = h.makeProject();
    const cases = [
      [".", {}],
      [".agents", {}],
      [".agents", { asSource: true }],
      [".agents/handoffx/y", {}],
      [".agents/personas/x.md", {}],
      ["README.md", {}],
      ["package.json", {}],
      ["../AGENTS.md", {}],
      ["OLD_AGENTS_3.md", {}],
      [".agents/state.md", {}],
      ["/etc/passwd", {}],
      ["/etc/passwd", { asSource: true }],
    ];
    assert.deepEqual(check(dir, cases), cases.map(() => false));
  });

  test("only the frozen legacy names may be moved out of .agents/ or the root", () => {
    const dir = h.makeProject();
    const yes = [
      [".agents/state.md", { asSource: true }],
      [".agents/context.md", { asSource: true }],
      [".agents/archive/2020/x.md", { asSource: true }],
      [".agents/old_agent_files/agents/OLD_AGENTS_1.md", { asSource: true }],
      [".agents/custom/notes.md", { asSource: true }],
      ["OLD_AGENTS_3.md", { asSource: true }],
      ["OLD_GEMINI_1.md", { asSource: true }],
    ];
    const no = [
      [".agents/notes.md", { asSource: true }],
      [".agents/skills/state.md", { asSource: true }],
      [".agents/archive", {}],
      ["OLD_CURSOR_1.md", { asSource: true }],
      ["OLD_AGENTS_x.md", { asSource: true }],
    ];
    assert.deepEqual(check(dir, yes), yes.map(() => true));
    assert.deepEqual(check(dir, no), no.map(() => false));
  });

  test("a custom hooks path outside the project is allowed, nothing else outside is", () => {
    const dir = h.makeProject();
    const hooks = h.makeProject({ git: false, name: "hooks" });
    // Through git, not string concatenation: a `C:\…` path in a hand-written
    // config line is a parse error on Windows.
    spawnSync("git", ["config", "core.hooksPath", hooks], { cwd: dir });
    const cases = [
      [path.join(hooks, "post-merge"), {}],
      [path.join(hooks, "..", "AGENTS.md"), {}],
    ];
    assert.deepEqual(check(dir, cases), [true, false]);
  });

  test("the guard is wired in: a run never creates anything outside its own paths", () => {
    const dir = h.makeProject();
    h.fixtureSkill(dir, ".agents/skills", "x");
    fs.mkdirSync(path.join(dir, ".agents", "personas"));
    fs.writeFileSync(path.join(dir, ".agents", "personas", "p.md"), "persona\n");
    const before = h.snapshot(dir);

    const result = h.run(dir, h.pointerNames.map(h.flagFor));
    assert.equal(result.code, 0, result.out);
    const after = h.snapshot(dir);
    const touched = [...after].filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
    const outside = touched.filter(
      (k) => !k.startsWith(".agents/handoff") && !h.pointerNames.includes(k),
    );
    assert.deepEqual(outside, [], "paths changed outside agent-sesh's own");
    assert.deepEqual([...before].filter(([k]) => !after.has(k)).map(([k]) => k), [], "nothing removed");
  });
});
