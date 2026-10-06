#!/usr/bin/env node
"use strict";

// Compares the agent registry inside index.js with the one in
// vercel-labs/skills (src/agents.ts), so falling behind upstream is a
// one-command find.
//
//   node scripts/check-skills-registry.js              # fetch upstream main
//   node scripts/check-skills-registry.js agents.ts    # compare a local copy
//
// Exits 1 on any drift: an agent added or removed upstream, or a changed
// display name or project skills folder.

const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

const UPSTREAM = "https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts";

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "user-agent": "agent-sesh registry check" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
          res.resume();
          resolve(fetchText(res.headers.location, redirects + 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`${url}: HTTP ${res.statusCode}`));
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

// Pulls name / displayName / skillsDir out of each entry of the `agents`
// record. The file is TypeScript, but those three fields are plain string
// literals in every entry, so a regex is enough — and it fails loudly if
// the shape ever changes. Line comments may sit between the fields (droid
// and pi carry one), so the gaps allow them; missing that once reported both
// agents as removed upstream.
function parseUpstream(source) {
  const gap = String.raw`,(?:\s|//[^\n]*)*`;
  const pattern = new RegExp(
    String.raw`name:\s*'([^']+)'${gap}displayName:\s*'([^']+)'${gap}skillsDir:\s*'([^']+)'`,
    "g",
  );
  const agents = [];
  let match;
  while ((match = pattern.exec(source))) {
    agents.push({ id: match[1], name: match[2], skillsDir: match[3] });
  }
  if (agents.length < 50) {
    throw new Error(`only ${agents.length} agents parsed from upstream — has agents.ts changed shape?`);
  }
  return agents;
}

async function main() {
  const local = process.argv[2];
  const source = local ? fs.readFileSync(path.resolve(local), "utf8") : await fetchText(UPSTREAM);
  const upstream = parseUpstream(source);
  const ours = require(path.resolve(__dirname, "..", "index.js")).agentRegistry;

  const byId = (list) => new Map(list.map((agent) => [agent.id, agent]));
  const theirs = byId(upstream);
  const mine = byId(ours);

  const problems = [];
  for (const [id, agent] of theirs) {
    const own = mine.get(id);
    if (!own) {
      problems.push(`missing: ${id} (${agent.name}, ${agent.skillsDir})`);
      continue;
    }
    if (own.name !== agent.name) problems.push(`${id}: name "${own.name}" → upstream "${agent.name}"`);
    if (own.skillsDir !== agent.skillsDir) {
      problems.push(`${id}: skillsDir "${own.skillsDir}" → upstream "${agent.skillsDir}"`);
    }
  }
  for (const id of mine.keys()) {
    if (!theirs.has(id)) problems.push(`extra: ${id} is not in upstream`);
  }

  const where = local ? path.resolve(local) : UPSTREAM;
  if (problems.length === 0) {
    console.log(`registry matches ${where}: ${upstream.length} agents`);
    return;
  }

  console.error(`registry drift against ${where}:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
