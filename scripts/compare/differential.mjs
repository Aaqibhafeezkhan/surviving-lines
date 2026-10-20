#!/usr/bin/env node
// Run the differential tests (test/differential-*.test.mjs) with the competitors required. Plain
// `npm test` skips them, with a reason, when _upstream/ is empty; this command fails instead.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./adapters.mjs";

const files = readdirSync(join(ROOT, "test")).filter((f) => /^differential-.*\.test\.mjs$/.test(f)).map((f) => join("test", f));
const run = spawnSync(process.execPath, ["--test", ...files], { cwd: ROOT, stdio: "inherit", env: { ...process.env, SL_REQUIRE_UPSTREAM: "1" } });
process.exit(run.status ?? 1);
