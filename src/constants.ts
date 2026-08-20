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

/**
 * The tag *grammar* is open even though the vocabulary is closed: a token that
 * matches this is an unknown-tag error, a run containing one that does not is
 * not a tag run at all (the heading then fails as a whole).
 */
export const TAG_GRAMMAR_RE = /^[a-z][a-z0-9-]*$/;

/**
 * Pre-release identifiers that are really channels wearing a pre-release's
 * syntax (`338.13-Stable`); a validator warns on these.
 */
export const CHANNEL_LIKE_PRERELEASE = [
  "stable",
  "release",
  "final",
  "ga",
  "lts",
  "hotfix",
] as const;

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

/**
 * Frontmatter keys. `product.` and `document.` are closed sets (unknowns are
 * errors); unknown *top-level* keys only warn, because changelogs get hosted
 * through static-site generators whose frontmatter is not this format's to
 * police. Keys beginning `x-` are permitted anywhere and never validated.
 */
export const FRONTMATTER_KEYS = {
  top: ["changelog", "product", "document"],
  product: [
    "name",
    "vendor",
    "homepage",
    "id",
    "description",
    "platforms",
    "versioning",
    "category",
    "color",
  ],
  document: ["updated", "coverage", "canonical", "locale", "older"],
} as const;

export const COVERAGE_VALUES = ["complete", "partial"] as const;

export const VERSIONING_VALUES = ["semver", "calver", "none"] as const;
export type Versioning = (typeof VERSIONING_VALUES)[number];
