// @ts-check
// Trust pass 2026-11-02, item 3: the same name on two company domains is a common-name collision as often as one person
// changing jobs, so it is a weak suggestion (never merged by --merge-identities). The numeric effect of a merge on the
// shares is printed for every suggestion. Each repository is built inside the test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRepo, commitAsIdentity, removeRepo, lines } from "../scripts/fixtures.mjs";

const BIN = fileURLToPath(new URL("../bin/surviving-lines.js", import.meta.url));
const { parseArgs, analyse } = await import("../bin/surviving-lines.js");
const day = (/** @type {number} */ i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().replace(/\.\d{3}Z$/, "Z");

/** @param {[string, string, number][]} people name, address, lines @param {(dir: string) => Promise<void>} fn */
async function withPeople(people, fn) {
  const dir = createRepo("sl-names-");
  try {
    people.forEach(([name, mail, n], i) => commitAsIdentity(dir, [name, mail], day(i), `c${i}`, { [`f${i}.js`]: lines(`f${i}`, n) }));
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

/** @param {string} dir */
const hints = async (dir) => (await analyse(parseArgs(["--cwd", dir, "-q"]))).identityHints.people;

test("SN-1: the same name on two different company domains is weak and is not merged", async () => {
  await withPeople([["Wei Zhang", "wei@acme.com", 60], ["Wei Zhang", "wzhang@globex.io", 30], ["Eve", "eve@x.org", 10]], async (dir) => {
    const [g] = await hints(dir);
    assert.equal(g.strength, "weak");
    const merged = await analyse(parseArgs(["--cwd", dir, "-q", "--merge-identities"]));
    assert.equal(merged.authors.length, 4 - 1, "three rows: nobody is merged");
    assert.equal(merged.identityMerge.groups.length, 0);
    assert.equal(merged.authors.find((a) => a.mail === "wei@acme.com")?.lines, 60);
  });
});

test("SN-2: the same name with a personal or noreply address stays strong (the usual one person)", async () => {
  for (const other of ["wei.zhang@gmail.com", "5+weizhang@users.noreply.github.com", "wei@localhost"]) {
    await withPeople([["Wei Zhang", "wei@acme.com", 60], ["Wei Zhang", other, 30]], async (dir) => {
      assert.equal((await hints(dir))[0].strength, "strong", other);
    });
  }
});

test("SN-3: two hosts of one organisation (subdomain, same registrable domain) stay strong; two organisations under co.uk are weak", async () => {
  await withPeople([["Wei Zhang", "wei@acme.com", 20], ["Wei Zhang", "wei@mail.acme.com", 20]], async (dir) => {
    assert.equal((await hints(dir))[0].strength, "strong");
  });
  await withPeople([["Wei Zhang", "w@dev.acme.co.uk", 20], ["Wei Zhang", "w@acme.co.uk", 20]], async (dir) => {
    assert.equal((await hints(dir))[0].strength, "strong");
  });
  await withPeople([["Wei Zhang", "w@acme.co.uk", 20], ["Wei Zhang", "w@globex.co.uk", 20]], async (dir) => {
    assert.equal((await hints(dir))[0].strength, "weak");
  });
});

test("SN-4: a shared address name on top of the shared name is still one weak kind of evidence", async () => {
  await withPeople([["Wei Zhang", "wei@acme.com", 20], ["Wei Zhang", "wei@globex.io", 20]], async (dir) => {
    assert.equal((await hints(dir))[0].strength, "weak");
  });
});

test("SN-5: a second, different kind of evidence makes it strong again (the full name is the other's address name)", async () => {
  await withPeople([["Wei Zhang", "wei@acme.com", 20], ["Wei Zhang", "weizhang@globex.io", 20]], async (dir) => {
    assert.equal((await hints(dir))[0].strength, "strong");
  });
});

test("SN-6: the weak reason names both domains and says two people can share a name", async () => {
  await withPeople([["Wei Zhang", "wei@acme.com", 20], ["Wei Zhang", "wzhang@globex.io", 20]], async (dir) => {
    const out = spawnSync(process.execPath, [BIN, "--cwd", dir, "-q", "--identities"], { encoding: "utf8" }).stdout;
    assert.match(out, /acme\.com/);
    assert.match(out, /globex\.io/);
    assert.match(out, /two people can share a name/);
    assert.match(out, /strength: weak/);
  });
});

test("SN-7: --identities prints the numeric effect of a merge on the shares, equal to the JSON", async () => {
  await withPeople([["Wei Zhang", "wei@acme.com", 60], ["Wei Zhang", "wzhang@globex.io", 30], ["Eve", "eve@x.org", 10]], async (dir) => {
    const out = spawnSync(process.execPath, [BIN, "--cwd", dir, "-q", "--identities"], { encoding: "utf8" }).stdout;
    assert.match(out, /effect on shares if one person: 60\.0% \+ 30\.0% = 90\.0%/);
    const doc = JSON.parse(spawnSync(process.execPath, [BIN, "--cwd", dir, "-q", "--json"], { encoding: "utf8" }).stdout);
    const g = doc.identityHints.people[0];
    assert.deepEqual(g.members.map((/** @type {any} */ m) => [m.mail, m.lines]), [["wei@acme.com", 60], ["wzhang@globex.io", 30]]);
    assert.ok(Math.abs(g.members.reduce((/** @type {number} */ s, /** @type {any} */ m) => s + m.lineShare, 0) - g.lineShare) < 1e-9);
  });
});
