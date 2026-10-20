// Builds the deterministic "split" fixture (one person on two addresses) and prints its path.
// Used by docs/demo.tape so the --identities scene runs on synthetic people, not on real ones.
import { buildFixture } from "../../scripts/fixtures.mjs";
console.log(buildFixture("split"));
