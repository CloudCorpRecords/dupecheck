import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findDuplicateDependencies, round3 } from "../src/dupecheck.js";

/**
 * All tests are pure local computation over inline dependency
 * lists: no filesystem, no network. Each behaviour in the
 * spec is pinned by its own case, including the kept-copy
 * wasted_kb computation, alias groups, rounding, and every
 * validation path.
 */

const dep = (name: string, version: string, size_kb?: number) => ({
  name,
  version,
  ...(size_kb !== undefined ? { size_kb } : {}),
});

describe("findDuplicateDependencies — totals and the clean case", () => {
  it("reports no duplicates for a tree of distinct single versions", () => {
    const out = findDuplicateDependencies([dep("a", "1.0.0", 10), dep("b", "2.0.0", 20)]);
    assert.deepEqual(out.multi_version, []);
    assert.deepEqual(out.same_job, []);
    assert.equal(out.total_entries, 2);
    assert.equal(out.unique_names, 2);
    assert.equal(out.wasted_kb_total, 0);
  });

  it("counts total_entries as supplied entries and unique_names as distinct names", () => {
    const out = findDuplicateDependencies([
      dep("a", "1.0.0"),
      dep("a", "2.0.0"),
      dep("a", "3.0.0"),
      dep("b", "1.0.0"),
    ]);
    assert.equal(out.total_entries, 4);
    assert.equal(out.unique_names, 2);
  });
});

describe("findDuplicateDependencies — multi_version", () => {
  it("reports a name at two versions with wasted = sum minus the kept (greatest version) copy", () => {
    const out = findDuplicateDependencies([
      dep("lib", "1.0.0", 30),
      dep("lib", "2.0.0", 50),
      dep("other", "1.0.0", 5),
    ]);
    // kept copy is 2.0.0 (50 kb); wasted = 80 - 50 = 30
    assert.deepEqual(out.multi_version, [
      { name: "lib", versions: ["1.0.0", "2.0.0"], copies: 2, wasted_kb: 30 },
    ]);
    assert.equal(out.wasted_kb_total, 30);
  });

  it("keeps the code-unit greatest version, not the semver greatest", () => {
    // Code-unit: "9.0" > "10.0" because '9' > '1'.
    const out = findDuplicateDependencies([
      dep("lib", "10.0", 100),
      dep("lib", "9.0", 40),
    ]);
    assert.deepEqual(out.multi_version, [
      { name: "lib", versions: ["10.0", "9.0"], copies: 2, wasted_kb: 100 },
    ]);
  });

  it("sorts versions ascending code-unit and counts every copy", () => {
    const out = findDuplicateDependencies([
      dep("lib", "2.0.0", 10),
      dep("lib", "10.0.0", 10),
      dep("lib", "1.0.0", 10),
    ]);
    assert.equal(out.multi_version[0].copies, 3);
    assert.deepEqual(out.multi_version[0].versions, ["1.0.0", "10.0.0", "2.0.0"]);
    // kept is "2.0.0" code-unit max (10 kb); wasted = 30 - 10
    assert.equal(out.multi_version[0].wasted_kb, 20);
  });

  it("does not report a name installed at a single distinct version", () => {
    const out = findDuplicateDependencies([dep("a", "1.0.0", 10), dep("b", "1.0.0", 10)]);
    assert.deepEqual(out.multi_version, []);
  });

  it("sorts multi_version entries by name ascending regardless of input order", () => {
    const out = findDuplicateDependencies([
      dep("zeta", "1.0.0", 1),
      dep("zeta", "2.0.0", 1),
      dep("alpha", "1.0.0", 1),
      dep("alpha", "2.0.0", 1),
    ]);
    assert.deepEqual(
      out.multi_version.map((e) => e.name),
      ["alpha", "zeta"],
    );
  });

  it("counts a missing size_kb as 0 for a non-kept copy", () => {
    const out = findDuplicateDependencies([dep("lib", "1.0.0"), dep("lib", "2.0.0", 50)]);
    assert.equal(out.multi_version[0].wasted_kb, 0);
  });

  it("counts a missing size_kb as 0 for the kept copy, so all other sizes are wasted", () => {
    const out = findDuplicateDependencies([dep("lib", "1.0.0", 25), dep("lib", "2.0.0")]);
    assert.equal(out.multi_version[0].wasted_kb, 25);
  });

  it("counts a missing size_kb as 0 when no entry carries a size", () => {
    const out = findDuplicateDependencies([dep("lib", "1.0.0"), dep("lib", "2.0.0")]);
    assert.equal(out.multi_version[0].wasted_kb, 0);
    assert.equal(out.wasted_kb_total, 0);
  });

  it("rounds wasted_kb to 3 decimals", () => {
    const out = findDuplicateDependencies([
      dep("lib", "1.0.0", 1.2344),
      dep("lib", "2.0.0", 2.3456),
    ]);
    // sum 3.58 - kept 2.3456 = 1.2344 -> round3 1.234
    assert.equal(out.multi_version[0].wasted_kb, 1.234);
  });

  it("rounds away float noise from size sums", () => {
    const out = findDuplicateDependencies([
      dep("lib", "1.0.0", 0.1),
      dep("lib", "2.0.0", 0.2),
      dep("lib", "3.0.0", 0.3),
    ]);
    // kept "3.0.0" (0.3); wasted = 0.1 + 0.2 = 0.30000000000000004 -> 0.3
    assert.equal(out.multi_version[0].wasted_kb, 0.3);
  });
});

describe("findDuplicateDependencies — same_job (alias groups)", () => {
  it("reports a group with >= 2 names present, wasted = all sizes of the non-canonical libraries", () => {
    const out = findDuplicateDependencies(
      [dep("moment", "2.29.0", 70), dep("dayjs", "1.11.0", 7), dep("other", "1.0.0", 3)],
      [{ canonical: "dayjs", names: ["moment", "dayjs"] }],
    );
    assert.deepEqual(out.same_job, [
      { canonical: "dayjs", present: ["dayjs", "moment"], wasted_kb: 70 },
    ]);
    assert.equal(out.wasted_kb_total, 70);
  });

  it("sorts present ascending and counts every version of a duplicate library as wasted", () => {
    const out = findDuplicateDependencies(
      [
        dep("keep", "1.0.0", 10),
        dep("dupe", "1.0.0", 20),
        dep("dupe", "2.0.0", 30),
      ],
      [{ canonical: "keep", names: ["dupe", "keep"] }],
    );
    assert.deepEqual(out.same_job, [
      { canonical: "keep", present: ["dupe", "keep"], wasted_kb: 50 },
    ]);
    // The multi-version waste for dupe (kept 2.0.0: 50 - 30 = 20)
    // and the same-job waste are separate entries; the total
    // sums both.
    assert.deepEqual(out.multi_version, [
      { name: "dupe", versions: ["1.0.0", "2.0.0"], copies: 2, wasted_kb: 20 },
    ]);
    assert.equal(out.wasted_kb_total, 70);
  });

  it("does not count the canonical library's own sizes as wasted, at any version", () => {
    const out = findDuplicateDependencies(
      [dep("keep", "1.0.0", 10), dep("keep", "2.0.0", 15), dep("dupe", "1.0.0", 8)],
      [{ canonical: "keep", names: ["keep", "dupe"] }],
    );
    assert.deepEqual(out.same_job, [
      { canonical: "keep", present: ["dupe", "keep"], wasted_kb: 8 },
    ]);
  });

  it("counts a missing size_kb as 0 inside alias groups", () => {
    const out = findDuplicateDependencies(
      [dep("keep", "1.0.0", 10), dep("dupe", "1.0.0")],
      [{ canonical: "keep", names: ["keep", "dupe"] }],
    );
    assert.equal(out.same_job[0].wasted_kb, 0);
  });

  it("rounds alias wasted_kb to 3 decimals", () => {
    const out = findDuplicateDependencies(
      [dep("keep", "1.0.0", 1), dep("dupe", "1.0.0", 2.6789)],
      [{ canonical: "keep", names: ["keep", "dupe"] }],
    );
    assert.equal(out.same_job[0].wasted_kb, 2.679);
  });

  it("sorts same_job entries by canonical ascending", () => {
    const out = findDuplicateDependencies(
      [
        dep("zeta-keep", "1.0.0", 1),
        dep("zeta-dupe", "1.0.0", 2),
        dep("alpha-keep", "1.0.0", 1),
        dep("alpha-dupe", "1.0.0", 4),
      ],
      [
        { canonical: "zeta-keep", names: ["zeta-keep", "zeta-dupe"] },
        { canonical: "alpha-keep", names: ["alpha-keep", "alpha-dupe"] },
      ],
    );
    assert.deepEqual(
      out.same_job.map((e) => e.canonical),
      ["alpha-keep", "zeta-keep"],
    );
  });

  it("produces no same_job entries when aliases is omitted or empty", () => {
    const deps = [dep("a", "1.0.0", 1), dep("b", "1.0.0", 1)];
    assert.deepEqual(findDuplicateDependencies(deps).same_job, []);
    assert.deepEqual(findDuplicateDependencies(deps, []).same_job, []);
  });

  it("excludes a group with fewer than 2 present names — such a group cannot pass validation, so its only present name is the kept one and the unknown name errors", () => {
    // Spec tension, pinned explicitly: the same_job rule says
    // a group needs >= 2 of its names present to be reported,
    // and the validation rule says every alias name must be a
    // supplied dependency. Together, a group with < 2 present
    // names is rejected (unknown dependency) rather than
    // silently excluded; the >= 2 present filter in the core
    // is the defensive implementation of the first rule.
    assert.throws(
      () =>
        findDuplicateDependencies(
          [dep("keep", "1.0.0", 10)],
          [{ canonical: "keep", names: ["keep", "ghost"] }],
        ),
      /aliases\[0\]\.names\[1\] references unknown dependency "ghost"/,
    );
  });

  it("sums multi_version and same_job waste into wasted_kb_total, rounded to 3 decimals", () => {
    const out = findDuplicateDependencies(
      [
        dep("lib", "1.0.0", 1.1111),
        dep("lib", "2.0.0", 2.2222),
        dep("keep", "1.0.0", 5),
        dep("dupe", "1.0.0", 3.3333),
      ],
      [{ canonical: "keep", names: ["keep", "dupe"] }],
    );
    // multi: 3.3333 - 2.2222 = 1.1111 -> 1.111
    // same_job: 3.3333 -> 3.333 ; total = round3(1.111 + 3.333)
    assert.equal(out.multi_version[0].wasted_kb, 1.111);
    assert.equal(out.same_job[0].wasted_kb, 3.333);
    assert.equal(out.wasted_kb_total, 4.444);
  });
});

describe("round3", () => {
  it("rounds to 3 decimals and normalises -0", () => {
    assert.equal(round3(1.23456), 1.235);
    assert.equal(round3(2.5), 2.5);
    assert.equal(round3(0), 0);
    assert.equal(round3(-0.0001), 0);
  });
});

describe("findDuplicateDependencies — validation: dependencies", () => {
  it("rejects missing, empty, or non-array dependencies", () => {
    assert.throws(() => findDuplicateDependencies(undefined), /dependencies is required/);
    assert.throws(() => findDuplicateDependencies([]), /dependencies must be a non-empty array/);
    assert.throws(() => findDuplicateDependencies("nope"), /dependencies must be a non-empty array/);
  });

  it("rejects a dependency entry that is not an object, naming the path", () => {
    assert.throws(() => findDuplicateDependencies([42]), /dependencies\[0\] must be an object/);
    assert.throws(
      () => findDuplicateDependencies([dep("a", "1.0.0"), "b"]),
      /dependencies\[1\] must be an object/,
    );
  });

  it("rejects an entry missing name or version, naming the path", () => {
    assert.throws(
      () => findDuplicateDependencies([{ version: "1.0.0" }]),
      /dependencies\[0\]\.name is required/,
    );
    assert.throws(
      () => findDuplicateDependencies([{ name: "a" }]),
      /dependencies\[0\]\.version is required/,
    );
  });

  it("rejects an empty or non-string name or version, naming the path", () => {
    assert.throws(
      () => findDuplicateDependencies([dep("", "1.0.0")]),
      /dependencies\[0\]\.name must be a non-empty string/,
    );
    assert.throws(
      () => findDuplicateDependencies([{ name: 42, version: "1.0.0" }]),
      /dependencies\[0\]\.name must be a non-empty string/,
    );
    assert.throws(
      () => findDuplicateDependencies([dep("a", "")]),
      /dependencies\[0\]\.version must be a non-empty string/,
    );
    assert.throws(
      () => findDuplicateDependencies([{ name: "a", version: 42 }]),
      /dependencies\[0\]\.version must be a non-empty string/,
    );
  });

  it("rejects a duplicate (name, version) pair, naming both paths", () => {
    assert.throws(
      () => findDuplicateDependencies([dep("a", "1.0.0"), dep("b", "1.0.0"), dep("a", "1.0.0")]),
      /dependencies\[2\] duplicates dependencies\[0\] \(name "a", version "1\.0\.0"\)/,
    );
  });

  it("allows the same name at different versions and the same version under different names", () => {
    const out = findDuplicateDependencies([dep("a", "1.0.0"), dep("a", "2.0.0"), dep("b", "1.0.0")]);
    assert.equal(out.total_entries, 3);
  });

  it("rejects a non-numeric size_kb, naming the path", () => {
    assert.throws(
      () => findDuplicateDependencies([{ name: "a", version: "1.0.0", size_kb: "12" }]),
      /dependencies\[0\]\.size_kb must be a number/,
    );
  });

  it("rejects a non-finite size_kb, naming the path", () => {
    assert.throws(
      () => findDuplicateDependencies([{ name: "a", version: "1.0.0", size_kb: Number.NaN }]),
      /dependencies\[0\]\.size_kb must be finite/,
    );
    assert.throws(
      () =>
        findDuplicateDependencies([
          { name: "a", version: "1.0.0", size_kb: Number.POSITIVE_INFINITY },
        ]),
      /dependencies\[0\]\.size_kb must be finite/,
    );
  });

  it("rejects a negative size_kb, naming the path, and accepts zero", () => {
    assert.throws(
      () => findDuplicateDependencies([dep("a", "1.0.0", -1)]),
      /dependencies\[0\]\.size_kb must be >= 0/,
    );
    const out = findDuplicateDependencies([dep("a", "1.0.0", 0)]);
    assert.equal(out.total_entries, 1);
  });
});

describe("findDuplicateDependencies — validation: aliases", () => {
  const deps = () => [dep("a", "1.0.0"), dep("b", "1.0.0"), dep("c", "1.0.0")];

  it("rejects a non-array aliases field and a non-object group, naming the path", () => {
    assert.throws(() => findDuplicateDependencies(deps(), "x"), /aliases must be an array/);
    assert.throws(() => findDuplicateDependencies(deps(), [42]), /aliases\[0\] must be an object/);
  });

  it("rejects a group missing canonical or names, naming the path", () => {
    assert.throws(
      () => findDuplicateDependencies(deps(), [{ names: ["a", "b"] }]),
      /aliases\[0\]\.canonical is required/,
    );
    assert.throws(
      () => findDuplicateDependencies(deps(), [{ canonical: "a" }]),
      /aliases\[0\]\.names is required/,
    );
  });

  it("rejects an empty or non-string canonical, naming the path", () => {
    assert.throws(
      () => findDuplicateDependencies(deps(), [{ canonical: "", names: ["a", "b"] }]),
      /aliases\[0\]\.canonical must be a non-empty string/,
    );
    assert.throws(
      () => findDuplicateDependencies(deps(), [{ canonical: 42, names: ["a", "b"] }]),
      /aliases\[0\]\.canonical must be a non-empty string/,
    );
  });

  it("rejects names with fewer than two entries or a non-array names field", () => {
    assert.throws(
      () => findDuplicateDependencies(deps(), [{ canonical: "a", names: ["a"] }]),
      /aliases\[0\]\.names must contain at least two entries/,
    );
    assert.throws(
      () => findDuplicateDependencies(deps(), [{ canonical: "a", names: "ab" }]),
      /aliases\[0\]\.names must be an array/,
    );
  });

  it("rejects a duplicate entry inside one group's names, naming the path", () => {
    assert.throws(
      () => findDuplicateDependencies(deps(), [{ canonical: "a", names: ["a", "b", "b"] }]),
      /aliases\[0\]\.names\[2\] duplicates aliases\[0\]\.names\[1\] "b"/,
    );
  });

  it("rejects a non-string or empty names entry, naming the path", () => {
    assert.throws(
      () => findDuplicateDependencies(deps(), [{ canonical: "a", names: ["a", 42] }]),
      /aliases\[0\]\.names\[1\] must be a non-empty string/,
    );
    assert.throws(
      () => findDuplicateDependencies(deps(), [{ canonical: "a", names: ["a", ""] }]),
      /aliases\[0\]\.names\[1\] must be a non-empty string/,
    );
  });

  it("rejects a canonical that is not one of the group's names, naming the path", () => {
    assert.throws(
      () => findDuplicateDependencies(deps(), [{ canonical: "c", names: ["a", "b"] }]),
      /aliases\[0\]\.canonical "c" is not one of the group's names/,
    );
  });

  it("rejects an alias name that is not a supplied dependency, naming the path (spec example shape)", () => {
    assert.throws(
      () =>
        findDuplicateDependencies(
          [dep("left-pad", "1.0.0"), dep("a", "1.0.0")],
          [{ canonical: "a", names: ["a", "ghost"] }],
        ),
      /aliases\[0\]\.names\[1\] references unknown dependency "ghost"/,
    );
  });

  it("rejects the same name appearing in two alias groups, naming the path", () => {
    assert.throws(
      () =>
        findDuplicateDependencies(deps(), [
          { canonical: "a", names: ["a", "b"] },
          { canonical: "b", names: ["b", "c"] },
        ]),
      /aliases\[1\]\.names\[0\] "b" already appears in aliases\[0\]/,
    );
  });
});
