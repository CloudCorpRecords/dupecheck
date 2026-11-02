/**
 * dupecheck types.
 *
 * dupecheck looks at one installed dependency tree, supplied
 * as a flat list of entries (name, version, and optionally
 * the installed size in kilobytes), plus optional alias
 * groups naming different libraries that do the same job.
 * It reports, as pure local computation:
 *
 *   - the libraries installed at two or more distinct
 *     versions, and the space wasted by keeping the extra
 *     copies alongside the newest one
 *   - the alias groups where two or more of the group's
 *     libraries are actually present, and the space wasted
 *     by the libraries other than the canonical keeper
 *   - entry / distinct-name totals and the total wasted
 *     kilobytes across both kinds of duplication
 *
 * Nothing is fetched or guessed: the report comes only from
 * the entries supplied.
 */

/** One installed dependency entry in the tree. */
export interface DependencyEntry {
  /** Package name. */
  name: string;
  /** Installed version. */
  version: string;
  /** Installed size in kilobytes; a missing size counts as 0. */
  size_kb?: number;
}

/** A group of different library names that do the same job. */
export interface AliasGroup {
  /** The library name to keep; one of the group's `names`. */
  canonical: string;
  /** Library names that do the same job; includes `canonical`. */
  names: string[];
}

/** One library installed at two or more distinct versions. */
export interface MultiVersionEntry {
  /** Package name. */
  name: string;
  /** Distinct installed versions, sorted ascending (code-unit). */
  versions: string[];
  /** Number of supplied entries with this name. */
  copies: number;
  /**
   * Sum of `size_kb` over this name's entries minus the
   * `size_kb` of the kept copy (the entry whose version is
   * the greatest, code-unit max), rounded to 3 decimals.
   */
  wasted_kb: number;
}

/** One alias group with two or more of its names present. */
export interface SameJobEntry {
  /** The library name to keep. */
  canonical: string;
  /** The group's names present in the tree, sorted ascending. */
  present: string[];
  /**
   * Sum of `size_kb` over every entry whose name is present
   * and is not the canonical name (all versions of those
   * libraries), rounded to 3 decimals.
   */
  wasted_kb: number;
}

/** The duplicate-dependency report. */
export interface DupeCheckResult {
  /** Libraries at >= 2 distinct versions, sorted by name. */
  multi_version: MultiVersionEntry[];
  /** Alias groups with >= 2 names present, sorted by canonical. */
  same_job: SameJobEntry[];
  /** Number of supplied dependency entries. */
  total_entries: number;
  /** Number of distinct dependency names. */
  unique_names: number;
  /** Round-3 sum of every `wasted_kb` above. */
  wasted_kb_total: number;
}
