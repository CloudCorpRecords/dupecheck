# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `find_duplicate_dependencies` MCP tool
  and `check` CLI command finding duplicate dependencies in
  one tree.
- Multi-version reports (distinct versions sorted ascending
  code-unit, copy counts, wasted kilobytes against the kept
  copy at the code-unit greatest version), same-job reports
  for alias groups with at least two names present (wasted
  kilobytes summed over every version of the non-canonical
  libraries), round-3 sizes with a missing `size_kb` counted
  as 0, and path-naming validation errors for duplicate
  `(name, version)` pairs, malformed sizes, and alias
  groups that reference unknown names, omit their canonical
  name, or share a name with another group.
