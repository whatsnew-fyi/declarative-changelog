/**
 * Every closed vocabulary in the v0.1 spec lives here, so a spec revision is
 * an edit to this file rather than a hunt through the rules.
 */

export const SPEC_VERSION = "0.1";

export const LIFECYCLE_TAGS = ["yanked", "routine"] as const;

export const PLATFORM_TAGS = [
  "windows",
  "macos",
  "linux",
  "ios",
  "android",
  "web",
  "playstation",
  "xbox",
  "switch",
] as const;

export const ALL_TAGS = [...LIFECYCLE_TAGS, ...PLATFORM_TAGS] as const;

export type LifecycleTag = (typeof LIFECYCLE_TAGS)[number];
export type PlatformTag = (typeof PLATFORM_TAGS)[number];
export type Tag = (typeof ALL_TAGS)[number];

/** Keep a Changelog's six categories, in canonical (non-alphabetical) order. */
export const CATEGORIES = [
  "Added",
  "Changed",
  "Deprecated",
  "Removed",
  "Fixed",
  "Security",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** The three accepted separators between the label and the date. */
export const SEPARATORS = [" — ", " – ", " - "] as const;

/** Closed key set of the escape hatch; an unknown key is a validation error. */
export const ESCAPE_HATCH_KEYS = [
  "channel",
  "url",
  "prerelease",
  "platforms",
  "covers",
  "superseded-by",
  "id",
  "version",
  "title",
  "date",
] as const;

/** Known frontmatter keys. The spec does not declare this set closed, so unknowns only warn. */
export const FRONTMATTER_KEYS = {
  top: ["changelog", "product", "document"],
  product: ["name", "vendor", "homepage", "id", "description", "platforms", "category", "color"],
  document: ["updated", "coverage", "canonical", "locale", "older"],
} as const;

export const COVERAGE_VALUES = ["complete", "partial"] as const;
