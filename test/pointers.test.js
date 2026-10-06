"use strict";

// The pointer files: every environment, every flag combination, mirroring,
// retirement, backups, protection and the hooks that keep them protected.

const { test, describe, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const h = require("./helpers");

after(h.cleanup);

const at = (dir, name) => path.join(dir, name);
const backupsDir = (dir, name) =>
  h.handoff(dir, "old_agent_files", name.replace(/\.md$/, "").toLowerCase());
const backupName = (name, n) => `OLD_${name.replace(/\.md$/, "")}_${n}.md`;

describe("flags", () => {
  for (const name of h.pointerNames) {
    test(`${h.flagFor(name)} writes ${name} from the template, read-only`, () => {
      const dir = h.makeProject();
      const result = h.run(dir, [h.flagFor(name)]);
      assert.equal(result.code, 0, result.out);
      assert.equal(h.read(at(dir, name)), h.templateFor(name));
      assert.match(result.out, /protection\s+read-only/);
      assert.ok(h.read(at(dir, name)).includes(`Do not edit this ${name} file`));
      assert.ok(!h.read(at(dir, name)).includes("AGENTS.md") || name === "AGENTS.md");
      assert.equal(h.mode(at(dir, name)), 0o444);
      assert.match(result.out, new RegExp(`${name}\\s+created`));
      assert.match(result.out, new RegExp(`${name} now points agents at`));
      for (const other of h.pointerNames) {
        if (other !== name) assert.ok(!h.exists(at(dir, other)), other);
      }
      assert.equal(fs.readdirSync(h.handoff(dir)).length, 4, "README + 3 folders, no backups");
    });
  }

  test("flags combine: all five at once, then a subset retires the rest", () => {
    const dir = h.makeProject();
    const all = h.run(dir, h.pointerNames.map(h.flagFor));
    assert.equal(all.code, 0, all.out);
    for (const name of h.pointerNames) {
      assert.equal(h.read(at(dir, name)), h.templateFor(name));
      assert.equal(h.mode(at(dir, name)), 0o444);
    }
    assert.match(all.out, /5 pointer files now point agents at/);

    const subset = h.run(dir, ["--claude", "--qwen"]);
    assert.equal(subset.code, 0, subset.out);
    assert.deepEqual(
      h.pointerNames.filter((name) => h.exists(at(dir, name))),
      ["CLAUDE.md", "QWEN.md"],
    );
    assert.match(subset.out, /CLAUDE\.md\s+already configured/);
    assert.match(subset.out, /retired\s+AGENTS\.md \(unmodified template, removed\)/);
    assert.match(subset.out, /retired\s+GEMINI\.md/);
    assert.match(subset.out, /retired\s+IFLOW\.md/);
    assert.ok(!h.exists(h.handoff(dir, "old_agent_files")), "templates are never backed up");
  });

  test("re-running is idempotent", () => {
    const dir = h.makeProject();
    h.run(dir, ["--uni", "--gemini"]);
    const before = h.snapshot(dir);
    const again = h.run(dir, ["--uni", "--gemini"]);
    assert.equal(again.code, 0);
    assert.match(again.out, /AGENTS\.md\s+already configured/);
    assert.match(again.out, /GEMINI\.md\s+already configured/);
    assert.match(again.out, /ready \(15 existing, 0 created\)/);
    h.assertSameMap(assert, h.snapshot(dir), before, "second run");
  });

  test("unknown flag, help, version, no-TTY default", () => {
    const dir = h.makeProject();
    const bad = h.run(dir, ["--cursor"]);
    assert.equal(bad.code, 1);
    assert.match(bad.out, /Unrecognised argument: --cursor/);
    assert.match(bad.out, /--uni \| --claude \| --gemini \| --qwen \| --iflow \| --agents/);
    assert.ok(!h.exists(at(dir, ".agents")));

    const help = h.run(dir, ["--help"]);
    assert.equal(help.code, 0);
    for (const name of h.pointerNames) assert.ok(help.out.includes(name), name);
    assert.match(help.out, /flags combine/);

    const version = h.run(dir, ["--version"]);
    assert.equal(version.stdout.trim(), require("../package.json").version);

    const quiet = h.run(dir, []);
    assert.equal(quiet.code, 0, quiet.out);
    assert.match(quiet.out, /No interactive terminal detected — defaulting to Universal \(AGENTS\.md\)/);
    assert.match(quiet.out, /--claude, --gemini, --qwen and --iflow/);
    assert.ok(h.exists(at(dir, "AGENTS.md")));
    assert.ok(!h.exists(at(dir, "CLAUDE.md")));
  });
});

describe("hand-written content", () => {
  test("onboarding: a pointer from before agent-sesh is backed up and replaced", () => {
    const dir = h.makeProject();
    const custom = h.customPointer("AGENTS.md", undefined, { foreign: true });
    h.write(at(dir, "AGENTS.md"), custom.content);

    const result = h.run(dir, ["--uni", "--claude"]);
    assert.equal(result.code, 0, result.out);
    assert.equal(h.read(at(dir, "AGENTS.md")), h.templateFor("AGENTS.md"));
    assert.equal(h.read(at(dir, "CLAUDE.md")), h.templateFor("CLAUDE.md"));
    assert.match(result.out, /AGENTS\.md\s+created; previous file saved as OLD_AGENTS_1\.md/);
    assert.match(result.out, /backup\s+old_agent_files\/agents\/OLD_AGENTS_1\.md/);
    assert.deepEqual(h.findSentinel(dir, custom.sentinel), [
      ".agents/handoff/old_agent_files/agents/OLD_AGENTS_1.md",
    ]);
    assert.ok(h.exists(path.join(backupsDir(dir, "AGENTS.md"), "README.md")));
    assert.ok(!h.exists(backupsDir(dir, "CLAUDE.md")), "no empty backup folders");
  });

  test("switching away from a hand-written pointer carries it across, mirrored", () => {
    const dir = h.makeProject();
    const custom = h.customPointer("CLAUDE.md");
    h.write(at(dir, "CLAUDE.md"), custom.content);

    const result = h.run(dir, ["--uni", "--gemini"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /AGENTS\.md\s+migrated from CLAUDE\.md/);
    assert.match(result.out, /GEMINI\.md\s+migrated from CLAUDE\.md/);
    assert.equal(h.read(at(dir, "AGENTS.md")), custom.content.split("CLAUDE.md").join("AGENTS.md"));
    assert.equal(h.read(at(dir, "GEMINI.md")), custom.content.split("CLAUDE.md").join("GEMINI.md"));
    assert.ok(!h.exists(at(dir, "CLAUDE.md")));
    assert.match(result.out, /backup\s+old_agent_files\/claude\/OLD_CLAUDE_1\.md/);
    assert.deepEqual(h.findSentinel(dir, custom.sentinel).sort(), [
      ".agents/handoff/old_agent_files/claude/OLD_CLAUDE_1.md",
      "AGENTS.md",
      "GEMINI.md",
    ]);
  });

  test("a kept hand-written pointer is the source for new ones", () => {
    const dir = h.makeProject();
    h.run(dir, ["--uni", "--claude"]);
    const custom = h.customPointer("AGENTS.md");
    h.write(at(dir, "AGENTS.md"), custom.content);

    const result = h.run(dir, ["--uni", "--claude", "--qwen"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /AGENTS\.md\s+kept your existing file/);
    assert.match(result.out, /CLAUDE\.md\s+migrated from AGENTS\.md/);
    assert.match(result.out, /QWEN\.md\s+migrated from AGENTS\.md/);
    assert.equal(h.read(at(dir, "AGENTS.md")), custom.content);
    assert.equal(h.read(at(dir, "QWEN.md")), custom.content.split("AGENTS.md").join("QWEN.md"));
    assert.ok(!h.exists(h.handoff(dir, "old_agent_files")));
  });

  test("conflict: kept and retired both hand-written and different", () => {
    const dir = h.makeProject();
    const a = h.customPointer("AGENTS.md", "aaaa");
    const c = h.customPointer("CLAUDE.md", "cccc");
    h.write(at(dir, "AGENTS.md"), a.content);
    h.write(at(dir, "CLAUDE.md"), c.content);

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /AGENTS\.md\s+kept your existing file/);
    assert.match(result.out, /Both AGENTS\.md and CLAUDE\.md had custom content/);
    assert.match(result.out, /CLAUDE\.md was saved as OLD_CLAUDE_1\.md/);
    assert.equal(h.read(at(dir, "AGENTS.md")), a.content);
    assert.deepEqual(h.findSentinel(dir, c.sentinel), [".agents/handoff/old_agent_files/claude/OLD_CLAUDE_1.md"]);
  });

  test("two kept hand-written pointers that differ are both kept and reported", () => {
    const dir = h.makeProject();
    const a = h.customPointer("AGENTS.md", "aaaa");
    const c = h.customPointer("CLAUDE.md", "cccc");
    h.write(at(dir, "AGENTS.md"), a.content);
    h.write(at(dir, "CLAUDE.md"), c.content);

    const result = h.run(dir, ["--uni", "--claude"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /AGENTS\.md and CLAUDE\.md are all customised, and they differ/);
    assert.equal(h.read(at(dir, "AGENTS.md")), a.content);
    assert.equal(h.read(at(dir, "CLAUDE.md")), c.content);
    assert.ok(!h.exists(h.handoff(dir, "old_agent_files")));
  });

  test("retiring a pointer that matches the kept one is a backup, not a conflict", () => {
    const dir = h.makeProject();
    const custom = h.customPointer("AGENTS.md");
    h.write(at(dir, "AGENTS.md"), custom.content);
    h.write(at(dir, "CLAUDE.md"), custom.content.split("AGENTS.md").join("CLAUDE.md"));

    const result = h.run(dir, ["--claude"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /CLAUDE\.md\s+kept your existing file/);
    assert.match(result.out, /backup\s+old_agent_files\/agents\/OLD_AGENTS_1\.md/);
    assert.doesNotMatch(result.out, /had custom content/);
    assert.equal(h.read(at(dir, "CLAUDE.md")), custom.content.split("AGENTS.md").join("CLAUDE.md"));
  });

  test("a foreign file next to an adopted pointer is backed up, then mirrored", () => {
    const dir = h.makeProject();
    const adopted = h.customPointer("AGENTS.md", "adopted");
    const foreign = h.customPointer("CLAUDE.md", "foreign", { foreign: true });
    h.write(at(dir, "AGENTS.md"), adopted.content);
    h.write(at(dir, "CLAUDE.md"), foreign.content);

    const result = h.run(dir, ["--uni", "--claude"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /AGENTS\.md\s+kept your existing file/);
    assert.match(result.out, /CLAUDE\.md\s+migrated from AGENTS\.md/);
    assert.match(result.out, /backup\s+old_agent_files\/claude\/OLD_CLAUDE_1\.md/);
    assert.equal(h.read(at(dir, "CLAUDE.md")), adopted.content.split("AGENTS.md").join("CLAUDE.md"));
    assert.deepEqual(h.findSentinel(dir, foreign.sentinel), [".agents/handoff/old_agent_files/claude/OLD_CLAUDE_1.md"]);

    const again = h.run(dir, ["--uni", "--claude"]);
    assert.match(again.out, /CLAUDE\.md\s+kept your existing file/);
    assert.doesNotMatch(again.out, /backup\s+/);
  });

  test("backups deduplicate by content and never renumber", () => {
    const dir = h.makeProject();
    const custom = h.customPointer("GEMINI.md", undefined, { foreign: true });
    h.write(at(dir, "GEMINI.md"), custom.content);
    h.run(dir, ["--gemini"]);
    assert.ok(h.exists(path.join(backupsDir(dir, "GEMINI.md"), backupName("GEMINI.md", 1))));

    h.write(at(dir, "GEMINI.md"), custom.content);
    const dup = h.run(dir, ["--gemini"]);
    assert.match(dup.out, /GEMINI\.md\s+recreated \(an identical backup already exists\)/);
    assert.equal(fs.readdirSync(backupsDir(dir, "GEMINI.md")).filter((n) => n.startsWith("OLD_")).length, 1);

    fs.unlinkSync(path.join(backupsDir(dir, "GEMINI.md"), backupName("GEMINI.md", 1)));
    h.write(path.join(backupsDir(dir, "GEMINI.md"), backupName("GEMINI.md", 7)), "older\n");
    h.write(at(dir, "GEMINI.md"), `${custom.content}more\n`);
    const next = h.run(dir, ["--gemini"]);
    assert.match(next.out, /OLD_GEMINI_8\.md/);
    assert.ok(h.exists(path.join(backupsDir(dir, "GEMINI.md"), backupName("GEMINI.md", 7))));
  });

  test("root OLD_*.md stragglers from older versions move into old_agent_files", () => {
    const dir = h.makeProject();
    h.write(at(dir, "OLD_AGENTS_2.md"), "straggler agents\n");
    h.write(at(dir, "OLD_QWEN_1.md"), "straggler qwen\n");
    h.write(at(dir, "OLD_UNKNOWN_1.md"), "not ours\n");

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.ok(!h.exists(at(dir, "OLD_AGENTS_2.md")));
    assert.ok(!h.exists(at(dir, "OLD_QWEN_1.md")));
    assert.equal(h.read(at(dir, "OLD_UNKNOWN_1.md")), "not ours\n");
    assert.equal(h.read(path.join(backupsDir(dir, "AGENTS.md"), backupName("AGENTS.md", 1))), "straggler agents\n");
    assert.equal(h.read(path.join(backupsDir(dir, "QWEN.md"), backupName("QWEN.md", 1))), "straggler qwen\n");
  });
});

describe("template recognition", () => {
  test("every historical template, under every pointer name, is discarded rather than backed up", () => {
    const bodies = [h.templateFor("AGENTS.md"), ...h.cli.legacyPointerTemplates];
    assert.equal(bodies.length, 5, "current + four frozen entries");

    for (const [index, body] of bodies.entries()) {
      for (const name of h.pointerNames) {
        const dir = h.makeProject();
        h.write(at(dir, name), body.replace(/AGENTS\.md/g, name));
        const result = h.run(dir, ["--iflow"]);
        assert.equal(result.code, 0, result.out);
        assert.ok(!h.exists(h.handoff(dir, "old_agent_files")), `template ${index} as ${name} was backed up`);
        if (name === "IFLOW.md") {
          assert.equal(h.read(at(dir, name)), h.templateFor(name));
          if (index > 0) assert.match(result.out, /recreated \(previous file was an unmodified template\)/);
        } else {
          assert.ok(!h.exists(at(dir, name)));
          assert.match(result.out, new RegExp(`retired\\s+${name} \\(unmodified template, removed\\)`));
        }
      }
    }
  });

  test("isDefaultTemplate rejects anything that differs by more than its line endings", () => {
    const body = h.templateFor("CLAUDE.md");
    assert.equal(h.cli.isDefaultTemplate(body), true);
    assert.equal(h.cli.isDefaultTemplate(body.replace(/\n/g, "\r\n")), true);
    assert.equal(h.cli.isDefaultTemplate(`\uFEFF${body}`), true);
    assert.equal(h.cli.isDefaultTemplate(`${body}\n`), false);
    assert.equal(h.cli.isDefaultTemplate(`${body}\r\n`), false);
    assert.equal(h.cli.isDefaultTemplate(body.replace("Agent", "agent")), false);
    assert.equal(h.cli.isDefaultTemplate(body.replace(/CLAUDE\.md/g, "GEMINI.md")), true);
    assert.equal(h.cli.isDefaultTemplate(body.replace(/CLAUDE\.md/g, "CURSOR.md")), false);
  });

  test("the generated pointer names the skills folder and never the wrong file", () => {
    for (const name of h.pointerNames) {
      const body = h.templateFor(name);
      assert.ok(body.includes(".agents/skills/"), name);
      assert.ok(body.includes("npx skills"), name);
      for (const other of h.pointerNames) {
        if (other !== name) assert.ok(!body.includes(other), `${name} mentions ${other}`);
      }
    }
  });
});

describe("errors", () => {
  test("a pointer that is a directory stops the run before anything is written", () => {
    const dir = h.makeProject();
    fs.mkdirSync(at(dir, "CLAUDE.md"));
    const result = h.run(dir, ["--uni", "--claude"]);
    assert.equal(result.code, 1);
    assert.match(result.out, /CLAUDE\.md exists but is not a regular file/);
    assert.ok(!h.exists(at(dir, "AGENTS.md")));
  });

  test("an unreadable pointer stops the run with a permissions hint", { skip: h.skipUnlessPosixPermissions() }, () => {
    const dir = h.makeProject();
    h.write(at(dir, "GEMINI.md"), "secret\n");
    fs.chmodSync(at(dir, "GEMINI.md"), 0o000);
    const result = h.run(dir, ["--uni"]);
    fs.chmodSync(at(dir, "GEMINI.md"), 0o644);
    assert.equal(result.code, 1);
    assert.match(result.out, /Cannot read GEMINI\.md/);
    assert.equal(h.read(at(dir, "GEMINI.md")), "secret\n");
  });

  test("a read-only project root gives guidance, not a bare EACCES", { skip: h.skipUnlessPosixPermissions() }, () => {
    const dir = h.makeProject();
    fs.chmodSync(dir, 0o555);
    const result = h.run(dir, ["--uni"]);
    fs.chmodSync(dir, 0o755);
    assert.equal(result.code, 1);
    assert.match(result.out, /Cannot create \.agents\/handoff\/ .*Fix the folder permissions/);
    assert.doesNotMatch(result.out, /^\s*EACCES/m);
  });
});

describe("protection and hooks", () => {
  test("the hook block names every pointer file and refreshes an older block", () => {
    const dir = h.makeProject();
    const hook = path.join(dir, ".git", "hooks", "post-merge");
    fs.mkdirSync(path.dirname(hook), { recursive: true });
    fs.writeFileSync(
      hook,
      "#!/bin/sh\necho custom\n# >>> agent-sesh >>>\nfor agent_sesh_file in 'AGENTS.md' 'CLAUDE.md'; do\n  :\ndone\n# <<< agent-sesh <<<\n",
    );

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    const source = h.read(hook);
    assert.ok(source.startsWith("#!/bin/sh\necho custom\n"));
    assert.equal(source.split("# >>> agent-sesh >>>").length, 2, "exactly one block");
    for (const name of h.pointerNames) assert.ok(source.includes(`'${name}'`), name);
    // Git for Windows needs no exec bit, and files without an extension report 0o666 there.
    if (process.platform !== "win32") assert.equal(h.mode(hook) & 0o111, 0o111);
    assert.match(result.out, /git hooks\s+post-merge, post-checkout/);
  });

  test("a foreign hook is left alone and the block is offered in a warning", () => {
    const dir = h.makeProject();
    const hook = path.join(dir, ".git", "hooks", "post-checkout");
    fs.mkdirSync(path.dirname(hook), { recursive: true });
    fs.writeFileSync(hook, "#!/usr/bin/env python3\nprint('hi')\n");
    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.equal(h.read(hook), "#!/usr/bin/env python3\nprint('hi')\n");
    assert.match(result.out, /Left the existing post-checkout hook untouched/);
    assert.match(result.out, /git hooks\s+post-merge$/m);
  });

  test("no repository: files are written, hooks are skipped with an explanation", () => {
    const dir = h.makeProject({ git: false });
    const result = h.run(dir, ["--claude"]);
    assert.equal(result.code, 0, result.out);
    assert.equal(h.mode(at(dir, "CLAUDE.md")), 0o444);
    assert.match(result.out, /git hooks\s+not installed/);
    assert.match(result.out, /No git repository here, so the protection hooks were not installed/);
    assert.match(result.out, /the pointer files lose their read-only flag/);
  });

  test("a project in a subfolder of a repository installs hooks on that repository with relative paths", () => {
    const repo = h.makeProject();
    const sub = path.join(repo, "packages", "app");
    fs.mkdirSync(sub, { recursive: true });
    const result = h.run(sub, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    const hook = h.read(path.join(repo, ".git", "hooks", "post-merge"));
    assert.ok(hook.includes("'packages/app/AGENTS.md'"));
    assert.ok(hook.includes("'packages/app/IFLOW.md'"));
    assert.match(result.out, /git repository root is/);
  });
});

describe("line endings", () => {
  const crlf = (text) => text.replace(/\n/g, "\r\n");

  test("a CRLF template (core.autocrlf) is recognised, reported as already configured and never backed up", () => {
    const dir = h.makeProject();
    h.write(at(dir, "AGENTS.md"), crlf(h.templateFor("AGENTS.md")));

    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /AGENTS\.md\s+already configured/);
    assert.ok(!h.exists(h.handoff(dir, "old_agent_files")));
    assert.ok(h.read(at(dir, "AGENTS.md")).includes("\r\n"), "left exactly as git checked it out");

    const before = h.snapshot(dir);
    const again = h.run(dir, ["--uni"]);
    assert.match(again.out, /AGENTS\.md\s+already configured/);
    h.assertSameMap(assert, h.snapshot(dir), before, "second run");
  });

  test("a CRLF legacy template is retired as an unmodified template", () => {
    const dir = h.makeProject();
    h.write(at(dir, "CLAUDE.md"), crlf(h.cli.legacyPointerTemplates[h.cli.legacyPointerTemplates.length - 1].replace(/AGENTS\.md/g, "CLAUDE.md")));
    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /retired\s+CLAUDE\.md \(unmodified template, removed\)/);
    assert.ok(!h.exists(h.handoff(dir, "old_agent_files")));
  });

  test("a CRLF adopted pointer is mirrored with its line endings and stays idempotent", () => {
    const dir = h.makeProject();
    const custom = h.customPointer("AGENTS.md");
    h.write(at(dir, "AGENTS.md"), crlf(custom.content));

    const result = h.run(dir, ["--uni", "--claude"]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /AGENTS\.md\s+kept your existing file/);
    assert.match(result.out, /CLAUDE\.md\s+migrated from AGENTS\.md/);
    assert.equal(h.read(at(dir, "CLAUDE.md")), crlf(custom.content).split("AGENTS.md").join("CLAUDE.md"));

    const before = h.snapshot(dir);
    const again = h.run(dir, ["--uni", "--claude"]);
    assert.doesNotMatch(again.out, /had custom content|differ|backup\s+/);
    h.assertSameMap(assert, h.snapshot(dir), before, "second run");
  });

  test("a CRLF hook keeps its line endings when the block is appended", () => {
    const dir = h.makeProject();
    const hook = path.join(dir, ".git", "hooks", "post-merge");
    fs.mkdirSync(path.dirname(hook), { recursive: true });
    fs.writeFileSync(hook, "#!/bin/sh\r\necho custom\r\n");
    const result = h.run(dir, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    const source = h.read(hook);
    assert.equal(source.split("# >>> agent-sesh >>>").length, 2);
    assert.ok(!/[^\r]\n/.test(source), "no bare LF introduced");
  });
});

describe("platform independence", () => {
  test("protection needs no external tool", () => {
    const dir = h.makeProject();
    const result = h.run(dir, ["--uni"], { extra: { [h.pathKey()]: "" } });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /protection\s+read-only/);
    assert.equal(h.mode(at(dir, "AGENTS.md")), 0o444);
    assert.match(result.out, /git hooks\s+not installed/);
  });

  test("a project reached through a link is not reported as a subfolder", { skip: h.skipWithoutSymlinks() }, () => {
    const repo = h.makeProject();
    const alias = h.linkDir(path.join(path.dirname(repo), "alias"), repo);
    const result = h.run(alias, ["--uni"]);
    assert.equal(result.code, 0, result.out);
    assert.doesNotMatch(result.out, /git repository root is/);
    const hook = h.read(path.join(repo, ".git", "hooks", "post-merge"));
    assert.ok(hook.includes("'AGENTS.md'"));
    assert.ok(!hook.includes(".."), hook);
  });
});
