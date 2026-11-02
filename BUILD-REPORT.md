# dupecheck — Build Report

MCP Rebuild 1000, Batch 14. Original program build from the
packages-100 plan (cluster F #66), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch14/dupecheck.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `dupecheck`, npm `@reneturcios/dupecheck`,
MCP name `io.github.CloudCorpRecords/dupecheck`, version
`0.1.0`, bin `dupecheck` → `dist/cli.js`.

## Files created (19/19 per factory checklist)

- `package.json`, `server.json` (description "Finds
  duplicate dependencies: same library at several versions,
  or alias libraries doing one job.", 97 chars ≤100; npm
  entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/dupecheck:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/dupecheck"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`check --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/dupecheck.ts` (core,
  `VERSION = "0.1.0"`)
- `test/dupecheck.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/dupecheck`,
  smoke-test server-name assertion `dupecheck`)

## Tools implemented (1)

- `find_duplicate_dependencies` — arguments:
  `dependencies` (array, required, minItems 1) of
  `{name (string, required, non-empty), version (string,
  required, non-empty), size_kb (number, optional; finite,
  >= 0)}`, plus `aliases` (array, optional) of
  `{canonical (string, required, non-empty), names (array
  of strings, required, minItems 2, includes canonical)}`.

  Returns `{multi_version, same_job, total_entries,
  unique_names, wasted_kb_total}`. `multi_version` holds
  one entry per name at >= 2 distinct versions
  `{name, versions (distinct, sorted ascending code-unit),
  copies, wasted_kb}`, where wasted_kb = (sum of size_kb
  over the name's entries) − (size_kb of the kept copy) and
  the kept copy is the entry whose version is the greatest
  in code-unit order; entries sorted by name. `same_job`
  holds one entry per alias group where >= 2 of the group's
  names are present `{canonical, present (sorted),
  wasted_kb}`, where wasted_kb sums size_kb over every
  entry whose name is present and != canonical (all
  versions of the duplicate libraries); entries sorted by
  canonical. Sizes are summed as given and reported rounded
  to 3 decimals; a missing `size_kb` counts as 0.

  The fixture literal
  (`harness/fixtures/dupecheck-tools-original.json`) and
  the `src/mcp.ts` literal are identical, with no `$schema`
  and no `additionalProperties`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the
  fixture, per the standing fleet rule (no McpServer/zod
  schema conversion). Every `tools/call` is validated by
  the core itself, so the MCP and CLI paths share one
  validation implementation.
- Validation is path-naming and total: dependencies
  missing/empty, an entry missing `name`/`version`, an
  empty/non-string name or version, a duplicate
  `(name, version)` pair, a `size_kb` that is non-numeric,
  non-finite, or negative, an alias group missing
  `canonical`/`names`, `names` with fewer than 2 entries or
  a duplicate entry, a `canonical` that is not one of the
  group's `names`, an alias name that is not a supplied
  dependency name, or the same name appearing in two alias
  groups throws an Error naming the offending path (e.g.
  `aliases[0].names[1] references unknown dependency
  "left-pad"`) and produces no partial result (MCP:
  `isError`; CLI: exit 1).
- The kept-copy rule is a pure code-unit string maximum,
  not semver: `"9.0"` is kept over `"10.0"`. Pinned by a
  dedicated test.
- `wasted_kb_total` sums the already-rounded per-entry
  `wasted_kb` values and rounds again (see "Gaps").

## Verification (foreground, this session)

- `npx tsc` exit 0 (`dist/cli.js` built; `chmod +x` applied
  so the bin executes directly, as with the reference build)
- `npm test` (`tsx --test test/*.test.ts`): **40 tests,
  40 pass, 0 fail** — clean-tree report and totals,
  multi-version entries with the kept-copy wasted
  computation, code-unit (not semver) kept-version and
  version sorting, copies counting, name sorting, missing
  `size_kb` counting as 0 for kept and non-kept copies and
  when absent everywhere, round-3 of wasted figures and of
  float-noise sums, alias groups (present sorted, all
  versions of non-canonical libraries wasted, canonical
  sizes never wasted, missing sizes as 0, rounding,
  canonical sorting, omitted/empty aliases), the total as
  the sum of both waste kinds, `round3` itself (including
  -0 normalisation), and every validation path
  (missing/empty/non-array `dependencies`, non-object
  entry, missing/empty/non-string name and version,
  duplicate `(name, version)` pair, non-numeric /
  non-finite / negative `size_kb` with zero accepted,
  non-array `aliases`, non-object group, missing
  `canonical`/`names`, empty/non-string canonical,
  `names` under 2 entries or non-array, duplicate `names`
  entry, non-string/empty `names` entry, canonical not in
  `names`, unknown alias name in the spec's example shape,
  and a name shared by two alias groups)
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `check` with no `--input` exits 2;
  `check --input <missing file>` exits 1 naming the file;
  `check --input <valid file>` exits 0 and prints the
  report JSON (verified against a hand-checked tree:
  multi_version `lib [1.0.0, 2.0.0] copies 2 wasted 30`,
  same_job `dayjs present [dayjs, moment] wasted 70`,
  totals 4 entries / 3 names / 100); `check --input
  <invalid file>` exits 1 with
  `aliases[0].names[1] references unknown dependency "left-pad"`
- Parity: `harness/parity.py` vs
  `harness/fixtures/dupecheck-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (the rebuild
  spec recorded in `parity-out/parity.json` uses the
  expanded absolute path for `dist/cli.js`, as the
  reference build's parity record does; the literal
  `~/…` form is not expanded by the harness's shlex split
  and node resolves it as a relative path)

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp copy
without `node_modules`/`dist`/`package-lock.json`, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/dupecheck`, **128 package entries**. Local
`node_modules` was installed via `npm install
--ignore-scripts --offline` for build/test; gitignored.

## Gaps / honest notes

- **Alias groups with < 2 present names are unreachable
  through the public API.** The spec both (a) reports a
  group only where >= 2 of its names are present and
  (b) makes an alias name that is not a supplied dependency
  name a validation error. Together, every name of a valid
  group is present, so the < 2-present case can only arise
  as the unknown-dependency error. Both rules are
  implemented exactly as written (the >= 2-present filter
  is in the core; the validation error fires first), a test
  pins the resulting error for a 1-present construction,
  and the README states the consequence plainly.
- **`wasted_kb_total` summation order:** the spec defines
  it as "round3(sum of every wasted_kb above)"; the
  per-entry `wasted_kb` values are the rounded ones
  reported above, so the implementation sums those rounded
  values and rounds the total again, rather than summing
  unrounded intermediates. The two readings can differ by
  at most 0.001 per entry on adversarial sizes.
- **Error wordings the spec does not fix:** duplicate-pair,
  duplicate-`names`-entry, and shared-name-across-groups
  messages follow the reference build's path-naming style
  (e.g. `dependencies[2] duplicates dependencies[0] (name
  "a", version "1.0.0")`); the spec's one fixed example
  shape (unknown alias name) is matched verbatim.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
