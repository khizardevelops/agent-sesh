"use strict";

// Every prompt path, driven through a real pty: the multi-select, its
// pre-selection, cancelling at each step, reinit, the git-init offer, and the
// 80-column rendering of every box.

const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const h = require("./helpers");

after(h.cleanup);

const skip = h.skipWithoutPython();
const at = (dir, name) => path.join(dir, name);
const presentPointers = (dir) => h.pointerNames.filter((name) => h.exists(at(dir, name)));

// Everything clack prints must fit the terminal: a folded box line breaks
// the list, and a folded note wraps mid-path. The prompt itself is excluded —
// it is redrawn in place, and with the cursor movement stripped its frames
// run together on one line.
function assertFits(out, cols = 80) {
  const printed = out
    .split("\n")
    .filter((line) => /^[│◇└┌├]/.test(line))
    .filter((line) => !/[◻◼○●◆]|↑\/↓|Space:/.test(line));
  const longest = Math.max(0, ...printed.map((line) => [...line].length));
  assert.ok(
    longest <= cols,
    `a line is ${longest} columns wide:\n${printed.find((l) => [...l].length === longest)}`,
  );
}

describe("fresh project", { skip }, () => {
  test("no agents detected: Universal alone is pre-selected", () => {
    const dir = h.makeProject();
    const r = h.pty(dir, "wait:Which environments do you want to set up;send:enter;wait:Done");
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /Brain\s+not set up yet/);
    assert.match(r.out, /Pointer\s+none/);
    assert.match(r.out, /Skills\s+none installed/);
    assert.match(r.out, /Agents\s+none detected/);
    assert.match(r.out, /◼ 🟢 Universal — AGENTS\.md/);
    assert.deepEqual(presentPointers(dir), ["AGENTS.md"]);
    assert.match(r.out, /1  Start your AI session with @AGENTS\.md\s+│/);
    assert.match(r.out, /Done — AGENTS\.md now points agents at/);
    assertFits(r.out);
  });

  test("detected agents are named, but only Universal is pre-selected", () => {
    const dir = h.makeProject();
    const home = h.makeHome(["claude-code", "codex", "gemini-cli", "opencode"]);
    const r = h.pty(dir, "wait:Which environments do you want to set up;send:enter;wait:Done", [], { home });
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /Agents\s+Claude Code, Codex, Gemini CLI, OpenCode detected/);
    assert.match(r.out, /◼ 🟢 Universal — AGENTS\.md \(detected: Codex, OpenCode\)/);
    // clack shows a hint only on the focused or ticked option.
    assert.match(r.out, /◻ 🟠 Claude Code — CLAUDE\.md\n/);
    assert.match(r.out, /◻ 🔵 Gemini CLI — GEMINI\.md\n/);
    assert.deepEqual(presentPointers(dir), ["AGENTS.md"]);
    assert.match(r.out, /Done — AGENTS\.md now points agents at/);
    assertFits(r.out);
  });

  test("a detected agent's pointer is one keypress away", () => {
    const dir = h.makeProject();
    const home = h.makeHome(["claude-code"]);
    const r = h.pty(dir, "wait:Which environments do you want to set up;send:down;send:space;send:enter;wait:Done", [], { home });
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /Claude Code — CLAUDE\.md \(detected: Claude Code\)/);
    assert.deepEqual(presentPointers(dir), ["AGENTS.md", "CLAUDE.md"]);
    assertFits(r.out);
  });

  test("toggling: drop Universal, pick Qwen and iFlow", () => {
    const dir = h.makeProject();
    const r = h.pty(
      dir,
      "wait:Which environments;send:space;send:down;send:down;send:down;send:space;send:down;send:space;send:enter;wait:Done",
    );
    assert.equal(r.exit, 0, r.out);
    assert.deepEqual(presentPointers(dir), ["QWEN.md", "IFLOW.md"]);
    assert.match(r.out, /QWEN\.md and IFLOW\.md now point agents at/);
    assertFits(r.out);
    assert.match(r.out, /\(or @IFLOW\.md\)/);
  });

  test("selecting nothing is refused, then a choice goes through", () => {
    const dir = h.makeProject();
    const r = h.pty(dir, "wait:Which environments;send:space;send:enter;wait:at least one;send:down;send:space;send:enter;wait:Done");
    assert.equal(r.exit, 0, r.out);
    assert.deepEqual(presentPointers(dir), ["CLAUDE.md"]);
  });

  test("cancelling at the environment prompt writes nothing", () => {
    const dir = h.makeProject();
    const r = h.pty(dir, "wait:Which environments;send:ctrlc");
    assert.equal(r.exit, 130, r.out);
    assert.match(r.out, /Cancelled/);
    assert.deepEqual(fs.readdirSync(dir).filter((n) => n !== ".git"), []);
  });

  test("no repository: accepting the offer installs hooks, declining explains", () => {
    const yes = h.makeProject({ git: false });
    const r1 = h.pty(yes, "wait:Which environments;send:enter;wait:Create one;send:enter;wait:Done");
    assert.equal(r1.exit, 0, r1.out);
    assert.match(r1.out, /git hooks\s+post-merge, post-checkout/);
    assert.ok(h.exists(path.join(yes, ".git", "hooks", "post-merge")));

    const no = h.makeProject({ git: false });
    const r2 = h.pty(no, "wait:Which environments;send:enter;wait:Create one;send:down;send:enter;wait:Done");
    assert.equal(r2.exit, 0, r2.out);
    assert.match(r2.out, /git hooks\s+not installed/);
    assert.match(r2.out, /protection hooks were not installed/);
    assert.ok(!h.exists(path.join(no, ".git")));
    assertFits(r2.out);
  });
});

describe("existing project", { skip }, () => {
  test("switch: current pointers are pre-selected; adding one mirrors, dropping one retires", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--uni"]).code, 0);
    const custom = h.customPointer("AGENTS.md");
    h.write(at(dir, "AGENTS.md"), custom.content);
    h.write(h.handoff(dir, "memory", "tasks.md"), "# Tasks\n\n- real task\n");

    const r = h.pty(
      dir,
      "wait:What do you want to do;send:down;send:enter;wait:Which environments should have a pointer file;send:down;send:space;send:enter;wait:Done",
    );
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /Brain\s+\.agents\/handoff\/ · 15 files/);
    assert.match(r.out, /Pointer\s+AGENTS\.md/);
    assert.match(r.out, /◼ 🟢 Universal — AGENTS\.md \(current\)/);
    assert.deepEqual(presentPointers(dir), ["AGENTS.md", "CLAUDE.md"]);
    assert.equal(h.read(at(dir, "AGENTS.md")), custom.content);
    assert.equal(h.read(at(dir, "CLAUDE.md")), custom.content.split("AGENTS.md").join("CLAUDE.md"));
    assert.equal(h.read(h.handoff(dir, "memory", "tasks.md")), "# Tasks\n\n- real task\n");
    assert.match(r.out, /CLAUDE\.md\s+migrated from AGENTS\.md/);
    assertFits(r.out);

    const r2 = h.pty(dir, "wait:What do you want to do;send:down;send:enter;wait:Which environments should have a pointer file;send:space;send:enter;wait:Done");
    assert.equal(r2.exit, 0, r2.out);
    assert.deepEqual(presentPointers(dir), ["CLAUDE.md"]);
    assert.match(r2.out, /backup\s+old_agent_files\/agents\/OLD_AGENTS_1\.md/);
    assertFits(r2.out);
  });

  test("reinit keeps every pointer as it is and archives the brain", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--uni", "--claude", "--gemini"]).code, 0);
    const custom = h.customPointer("CLAUDE.md");
    h.write(at(dir, "CLAUDE.md"), custom.content);
    h.write(h.handoff(dir, "memory", "state.md"), "# State\n\nfilled in\n");

    const r = h.pty(dir, "wait:What do you want to do;send:down;send:down;send:enter;wait:Proceed;send:enter;wait:Done");
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /Archived 4 active item\(s\)/);
    assert.deepEqual(presentPointers(dir), ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]);
    assert.equal(h.read(at(dir, "CLAUDE.md")), custom.content, "reinit never rewrites a pointer");
    for (const name of presentPointers(dir)) assert.match(r.out, new RegExp(`${name}\\s+already configured`));
    assert.equal(h.read(h.handoff(dir, "memory", "state.md")), h.cli.agentFiles["memory/state.md"]);
    const archives = fs.readdirSync(h.handoff(dir, "archive")).filter((n) => n !== "README.md");
    assert.equal(h.read(h.handoff(dir, "archive", archives[0], "memory", "state.md")), "# State\n\nfilled in\n");
    assert.match(r.out, /archive\s+archive\/.* \(18 paths\)/);
    assertFits(r.out);
  });

  test("reinit on a 1.0.x project fixes pointers that do not lead to the brain", () => {
    const dir = h.makeProject();
    h.write(path.join(dir, ".agents", "state.md"), "# State\n\nflat\n");
    h.write(path.join(dir, ".agents", "context.md"), "# Context\n\nflat\n");
    h.write(at(dir, "AGENTS.md"), h.cli.legacyPointerTemplates[h.cli.legacyPointerTemplates.length - 1]);
    const foreign = h.customPointer("CLAUDE.md", undefined, { foreign: true });
    h.write(at(dir, "CLAUDE.md"), foreign.content);

    const r = h.pty(dir, "wait:What do you want to do;send:down;send:down;send:enter;wait:Proceed;send:enter;wait:Done");
    assert.equal(r.exit, 0, r.out);
    assert.equal(h.read(at(dir, "AGENTS.md")), h.templateFor("AGENTS.md"));
    assert.equal(h.read(at(dir, "CLAUDE.md")), h.templateFor("CLAUDE.md"));
    assert.match(r.out, /AGENTS\.md\s+recreated \(previous file was an unmodified template\)/);
    assert.match(r.out, /CLAUDE\.md\s+created; previous file saved as OLD_CLAUDE_1\.md/);
    assert.deepEqual(h.findSentinel(dir, foreign.sentinel), [".agents/handoff/old_agent_files/claude/OLD_CLAUDE_1.md"]);
    assertFits(r.out);
  });

  test("reinit on a brain with no pointer asks which environments to set up", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--uni"]).code, 0);
    fs.chmodSync(at(dir, "AGENTS.md"), 0o644);
    fs.unlinkSync(at(dir, "AGENTS.md"));

    const r = h.pty(
      dir,
      "wait:What do you want to do;send:down;send:down;send:enter;wait:Which environments do you want to set up;send:down;send:space;send:enter;wait:Proceed;send:enter;wait:Done",
    );
    assert.equal(r.exit, 0, r.out);
    assert.deepEqual(presentPointers(dir), ["AGENTS.md", "CLAUDE.md"]);
  });

  test("declining the reinit confirmation changes nothing", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--claude"]).code, 0);
    h.write(h.handoff(dir, "memory", "state.md"), "# State\n\nkeep\n");
    const before = h.snapshot(dir);

    const r = h.pty(dir, "wait:What do you want to do;send:down;send:down;send:enter;wait:Proceed;send:n;wait:Nothing was changed");
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /Reinit cancelled/);
    h.assertSameMap(assert, h.snapshot(dir), before, "declined reinit");
  });

  test("cancelling at each prompt of an existing project changes nothing", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--uni"]).code, 0);
    const before = h.snapshot(dir);

    for (const steps of [
      "wait:What do you want to do;send:ctrlc",
      "wait:What do you want to do;send:down;send:enter;wait:Which environments should have a pointer file;send:ctrlc",
      "wait:What do you want to do;send:down;send:down;send:enter;wait:Proceed;send:ctrlc",
    ]) {
      const r = h.pty(dir, steps);
      assert.equal(r.exit, 130, `${steps}\n${r.out}`);
      h.assertSameMap(assert, h.snapshot(dir), before, steps);
    }
  });

  test("old layout: Enter on 'Upgrade to the new layout' migrates and asks nothing else", () => {
    const dir = h.makeProject();
    for (const flat of Object.keys(h.cli.legacyLayoutMap)) h.write(path.join(dir, ".agents", flat), `# ${flat}\n\nmine\n`);
    h.write(at(dir, "AGENTS.md"), h.cli.legacyPointerTemplates[h.cli.legacyPointerTemplates.length - 1]);

    const r = h.pty(dir, "wait:What do you want to do;send:enter;wait:Done");
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /brain uses an older agent-sesh layout/);
    assert.match(r.out, /● ⏫ Upgrade to the new layout/);
    assert.doesNotMatch(r.out, /Which environments/);
    assert.match(r.out, /migrated\s+15 item\(s\) moved in/);
    assert.equal(h.read(h.handoff(dir, "references", "overview.md")), "# context.md\n\nmine\n");
    assert.deepEqual(presentPointers(dir), ["AGENTS.md"]);
    assert.equal(h.read(at(dir, "AGENTS.md")), h.templateFor("AGENTS.md"));
    assertFits(r.out);
  });

  test("output has a left guide only, and wraps with it in a narrow window", () => {
    const dir = h.makeProject();
    for (const flat of Object.keys(h.cli.legacyLayoutMap)) h.write(path.join(dir, ".agents", flat), `# ${flat}\n`);
    h.write(at(dir, "AGENTS.md"), h.customPointer("AGENTS.md", undefined, { foreign: true }).content);

    const r = h.pty(dir, "wait:Moves your old;send:enter;wait:Done", [], { cols: 50 });
    assert.equal(r.exit, 0, r.out);
    // No top rule, right edge or bottom rule: nothing sized to the terminal.
    // Each section closes with a fixed-length fading divider instead.
    assert.doesNotMatch(r.out, /[╮╯╭╰]|├─/);
    assert.match(r.out, /◇  Workspace\n│\n│  Project/);
    assert.match(r.out, /◇  Summary\n│\n│  \.agents\/handoff\//);
    assert.match(r.out, /◇  Next steps\n│\n│  1  Start your AI session/);
    assert.match(r.out, /│  Git {8}repository detected\n│\n┣━{14}─{10}╌{4}┄{2}\n/);
    assert.match(r.out, /before\n│  you finish\n│\n┣━{14}─{10}╌{4}┄{2}\n│\n└  Done/);

    // Everything after the prompt (which clack redraws in place) is ours.
    const printed = r.out.slice(r.out.lastIndexOf("◇  Project brain ready")).split("\n").filter(Boolean);
    const settled = printed.filter((line) => !line.startsWith("[[pty-steps"));
    for (const line of settled) {
      assert.ok([...line].length <= 50, `too wide (${[...line].length}): ${line}`);
      assert.doesNotMatch(line, / $/, `trailing space: ${JSON.stringify(line)}`);
      assert.match(line, /^[│●▲◇└┣ ]/, `lost its guide: ${line}`);
    }
  });

  test("the detail box explains the option under the cursor and fits the terminal", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--uni"]).code, 0);

    for (const cols of [80, 50]) {
      const r = h.pty(
        dir,
        "wait:Brings this;send:down;wait:Choose which;send:down;wait:Moves the whole;send:ctrlc",
        [],
        { cols },
      );
      assert.equal(r.exit, 130, r.out);
      assert.match(r.out, /┌ ⏫ Update\n│  │ Brings this/);
      assert.match(r.out, /┌ 🔄 Change pointer files\n│  │ Choose which/);
      assert.match(r.out, /┌ 🔵 Start over\n│  │ Moves the whole/);
      assertFits(r.out, cols);
    }
  });

  test("current layout: Update keeps every pointer and the content, asks nothing else", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--uni", "--claude"]).code, 0);
    h.write(h.handoff(dir, "memory", "state.md"), "# State\n\nmine\n");
    // An untouched template from an older version gets brought up to date.
    h.write(h.handoff(dir, "memory", "tasks.md"), h.cli.agentFileBodies["memory/tasks.md"]);

    const r = h.pty(dir, "wait:What do you want to do;send:enter;wait:Done");
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /● ⏫ Update/);
    assert.doesNotMatch(r.out, /Which environments/);
    assert.deepEqual(presentPointers(dir), ["AGENTS.md", "CLAUDE.md"]);
    assert.equal(h.read(h.handoff(dir, "memory", "state.md")), "# State\n\nmine\n");
    assert.equal(h.read(h.handoff(dir, "memory", "tasks.md")), h.cli.agentFiles["memory/tasks.md"]);
    assert.match(r.out, /1 template\(s\) updated/);
    assertFits(r.out);
  });

  test("Update on a brain with no pointer asks which environments to set up", () => {
    const dir = h.makeProject();
    assert.equal(h.run(dir, ["--uni"]).code, 0);
    fs.chmodSync(at(dir, "AGENTS.md"), 0o644);
    fs.unlinkSync(at(dir, "AGENTS.md"));

    const r = h.pty(dir, "wait:What do you want to do;send:enter;wait:Which environments do you want to set up;send:enter;wait:Done");
    assert.equal(r.exit, 0, r.out);
    assert.deepEqual(presentPointers(dir), ["AGENTS.md"]);
  });

  test("a flat 1.0.x brain shows as 'will migrate' and migrates after the prompts", () => {
    const dir = h.makeProject();
    for (const flat of Object.keys(h.cli.legacyLayoutMap)) h.write(path.join(dir, ".agents", flat), `# ${flat}\n`);
    h.write(at(dir, "AGENTS.md"), h.cli.legacyPointerTemplates[h.cli.legacyPointerTemplates.length - 1]);

    const r = h.pty(dir, "wait:What do you want to do;send:down;send:enter;wait:Which environments should have a pointer file;send:enter;wait:Done");
    assert.equal(r.exit, 0, r.out);
    assert.match(r.out, /Brain\s+\.agents\/ · 15 files · will migrate/);
    assert.match(r.out, /migrated\s+15 item\(s\) moved in/);
    assert.ok(h.exists(h.handoff(dir, "references", "overview.md")));
    assertFits(r.out);
  });
});
