# dupecheck

A dependency tree quietly grows duplicates in two ways: the
same library ends up installed at several versions at once,
and two different libraries that do the same job both end up
in the tree. dupecheck takes the flat list of installed
dependencies — name, version, and optionally the installed
size in kilobytes — plus optional alias groups naming the
libraries that do the same job, and reports what is wasted:

- **Multiple versions** — one entry per library installed at
  two or more distinct versions, with the distinct versions
  (sorted ascending), the number of copies, and the wasted
  kilobytes: the sum of every copy's size minus the size of
  the kept copy. The kept copy is the entry whose version is
  the greatest in code-unit order — so `"9.0"` is kept over
  `"10.0"`, because `'9' > '1'` character by character. This
  is a string comparison, deliberately not a semver one.
- **Same job** — one entry per alias group where at least
  two of the group's libraries are present in the tree, with
  the present names (sorted) and the wasted kilobytes: the
  sum of the sizes of every entry — at every version — whose
  library is present and is not the group's canonical keeper.
- **Totals** — the number of supplied entries, the number of
  distinct names, and the total wasted kilobytes across both
  kinds of duplication.

A missing `size_kb` counts as 0, and every wasted figure is
rounded to 3 decimals. The same kilobytes can be counted
twice in the total — once as a multi-version waste and once
as a same-job waste — because the total is defined as the
sum of the per-entry figures above it.

Validation is strict and there are no partial reports: a
missing or empty dependency list, an entry missing its name
or version, a duplicate `(name, version)` pair, a negative
or non-finite size, an alias group whose canonical name is
not one of its names, an alias name that was not supplied as
a dependency, or a name claimed by two alias groups all
fail with an error naming the offending path, for example
`aliases[0].names[1] references unknown dependency
"left-pad"`. Note that because every alias name must be a
supplied dependency, a group with fewer than two present
names surfaces as that unknown-dependency error rather than
as a silent exclusion. The computation is pure and local:
no network, no configuration, no files read beyond the
input you pass in.

## CLI

```bash
npx @reneturcios/dupecheck check --input args.json
npx @reneturcios/dupecheck --version
```

`args.json` contains the full arguments object:

```json
{
  "dependencies": [
    { "name": "lib", "version": "1.0.0", "size_kb": 30 },
    { "name": "lib", "version": "2.0.0", "size_kb": 50 },
    { "name": "moment", "version": "2.29.0", "size_kb": 70 },
    { "name": "dayjs", "version": "1.11.0", "size_kb": 7 }
  ],
  "aliases": [
    { "canonical": "dayjs", "names": ["moment", "dayjs"] }
  ]
}
```

The report is printed as JSON:

```json
{
  "multi_version": [
    { "name": "lib", "versions": ["1.0.0", "2.0.0"], "copies": 2, "wasted_kb": 30 }
  ],
  "same_job": [
    { "canonical": "dayjs", "present": ["dayjs", "moment"], "wasted_kb": 70 }
  ],
  "total_entries": 4,
  "unique_names": 3,
  "wasted_kb_total": 100
}
```

Exit codes: `0` on success, `1` on a runtime error
(including an unreadable or invalid input file, or invalid
input), `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/dupecheck mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "dupecheck": {
      "command": "npx",
      "args": ["-y", "@reneturcios/dupecheck", "mcp"]
    }
  }
}
```

### Tools

- `find_duplicate_dependencies` — Find duplicate
  dependencies in one tree: the same library installed at
  multiple versions, and different libraries that do the
  same job, with the wasted kilobytes for each.
  - `dependencies` (array, required, at least one) —
    installed dependencies as `{name, version, size_kb?}`
    objects; `(name, version)` pairs are unique and a
    missing `size_kb` counts as 0
  - `aliases` (array, optional) — groups of different
    library names that do the same job, as
    `{canonical, names}` objects; `names` has at least two
    entries, includes the canonical name, and every name
    must be a supplied dependency

  Returns `{multi_version, same_job, total_entries,
  unique_names, wasted_kb_total}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/dupecheck
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/dupecheck check --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
