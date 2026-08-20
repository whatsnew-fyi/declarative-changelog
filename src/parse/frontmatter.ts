import {
  COVERAGE_VALUES,
  FRONTMATTER_KEYS,
  PLATFORM_TAGS,
  SPEC_VERSION,
  VERSIONING_VALUES,
  type Versioning,
} from "../constants.js";
import type { Diagnostic, LineIndex } from "../diagnostics.js";
import { parseIsoDate } from "./date.js";
import {
  asString,
  asStringList,
  asUrl,
  eachPair,
  isMap,
  parseProfiled,
  YamlContext,
} from "./yaml-utils.js";

export interface Frontmatter {
  changelog?: string;
  product: {
    name?: string;
    vendor?: string;
    homepage?: string;
    id?: string;
    description?: string;
    platforms?: string[];
    versioning?: Versioning;
    category?: string;
    color?: string;
  };
  document: {
    updated?: string;
    coverage?: "complete" | "partial";
    canonical?: string;
    locale?: string;
    older?: string;
  };
  /** Whether structural extraction succeeded well enough to trust the fields. */
  valid: boolean;
}

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const EXPLICIT_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * The one fixed default-id algorithm: lowercase, Unicode NFKD with combining
 * marks dropped, every run outside a-z0-9 becomes one `-`, trimmed. Returns
 * undefined when the name reduces to nothing (an all-CJK name, say).
 */
export function slugProductName(name: string): string | undefined {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s === "" ? undefined : s;
}

export function parseFrontmatter(
  yamlText: string,
  baseOffset: number,
  lines: LineIndex,
  diagnostics: Diagnostic[],
): Frontmatter {
  const fm: Frontmatter = { product: {}, document: {}, valid: true };
  const ctx = new YamlContext(baseOffset, lines, diagnostics, "frontmatter");
  const doc = parseProfiled(ctx, yamlText);

  if (doc === undefined || ctx.yamlErrors(doc, "invalid-yaml") || !isMap(doc.contents)) {
    if (doc !== undefined && !isMap(doc.contents) && doc.errors.length === 0) {
      ctx.report("invalid-yaml", "error", "Frontmatter must be a YAML map");
    }
    fm.valid = false;
    return fm;
  }

  eachPair(ctx, doc.contents, FRONTMATTER_KEYS.top, "", "warning", (key, pair) => {
    switch (key) {
      case "changelog": {
        const value = asString(ctx, pair, "changelog");
        if (value !== undefined) {
          fm.changelog = value;
          const major = /^(\d+)\.\d+$/.exec(value)?.[1];
          if (major !== SPEC_VERSION.split(".")[0]) {
            ctx.report(
              "unsupported-version",
              "error",
              `Unsupported format version \`${value}\` — this validator understands major version ${SPEC_VERSION.split(".")[0]}`,
              pair.value,
            );
          } else if (value !== SPEC_VERSION) {
            ctx.report(
              "unsupported-version",
              "warning",
              `Format version \`${value}\` is newer than this validator knows (${SPEC_VERSION}) — vocabulary it added will read as typos`,
              pair.value,
            );
          }
        }
        break;
      }
      case "product":
        if (!isMap(pair.value)) {
          ctx.report("type", "error", "`product` must be a map", pair.value ?? pair.key);
          break;
        }
        eachPair(ctx, pair.value, FRONTMATTER_KEYS.product, "product", "error", (k, p) => {
          switch (k) {
            case "homepage":
              fm.product.homepage = asUrl(ctx, p, "product.homepage");
              break;
            case "platforms": {
              const platforms = asStringList(ctx, p, "product.platforms");
              if (platforms) {
                for (const platform of platforms) {
                  if (!(PLATFORM_TAGS as readonly string[]).includes(platform)) {
                    ctx.report(
                      "unknown-platform",
                      "error",
                      `Unknown platform \`${platform}\` in \`product.platforms\` — known platforms: ${PLATFORM_TAGS.join(", ")}`,
                      p.value,
                    );
                  }
                }
                fm.product.platforms = platforms;
              }
              break;
            }
            case "versioning": {
              const value = asString(ctx, p, "product.versioning");
              if (value !== undefined) {
                if (!(VERSIONING_VALUES as readonly string[]).includes(value)) {
                  ctx.report(
                    "invalid-versioning",
                    "error",
                    `\`product.versioning\` must be one of ${VERSIONING_VALUES.join(", ")}, got \`${value}\` — a validator must never guess a scheme`,
                    p.value,
                  );
                } else {
                  fm.product.versioning = value as Versioning;
                }
              }
              break;
            }
            case "id": {
              const value = asString(ctx, p, "product.id");
              if (value !== undefined) {
                if (!EXPLICIT_ID_RE.test(value)) {
                  ctx.report(
                    "id-shape",
                    "warning",
                    `\`product.id\` should match \`[a-z0-9][a-z0-9-]*\`, got \`${value}\``,
                    p.value,
                  );
                }
                fm.product.id = value;
              }
              break;
            }
            case "color": {
              const color = asString(ctx, p, "product.color");
              if (color !== undefined) {
                if (!COLOR_RE.test(color)) {
                  ctx.report(
                    "invalid-color",
                    "error",
                    `\`product.color\` must be one opaque \`#RRGGBB\` hex, got \`${color}\``,
                    p.value,
                  );
                } else {
                  fm.product.color = color;
                }
              }
              break;
            }
            default: {
              const value = asString(ctx, p, `product.${k}`);
              if (value !== undefined) {
                fm.product[k as "name" | "vendor" | "description" | "category"] = value;
              }
            }
          }
        });
        break;
      case "document":
        if (!isMap(pair.value)) {
          ctx.report("type", "error", "`document` must be a map", pair.value ?? pair.key);
          break;
        }
        eachPair(ctx, pair.value, FRONTMATTER_KEYS.document, "document", "error", (k, p) => {
          switch (k) {
            case "updated": {
              const value = asString(ctx, p, "document.updated");
              if (value !== undefined) {
                const date = parseIsoDate(value);
                if (!date?.valid) {
                  ctx.report(
                    "invalid-timestamp",
                    "error",
                    `\`document.updated\` is not an RFC 3339 timestamp: \`${value}\``,
                    p.value,
                  );
                } else {
                  fm.document.updated = value;
                }
              }
              break;
            }
            case "coverage": {
              const value = asString(ctx, p, "document.coverage");
              if (value !== undefined) {
                if (!(COVERAGE_VALUES as readonly string[]).includes(value)) {
                  ctx.report(
                    "invalid-coverage",
                    "error",
                    `\`document.coverage\` must be \`complete\` or \`partial\`, got \`${value}\``,
                    p.value,
                  );
                } else {
                  fm.document.coverage = value as "complete" | "partial";
                }
              }
              break;
            }
            case "canonical":
              fm.document.canonical = asUrl(ctx, p, "document.canonical");
              break;
            case "older":
              fm.document.older = asUrl(ctx, p, "document.older");
              break;
            case "locale": {
              const value = asString(ctx, p, "document.locale");
              if (value !== undefined) {
                if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(value)) {
                  ctx.report(
                    "invalid-locale",
                    "error",
                    `\`document.locale\` is not a BCP 47 language tag: \`${value}\``,
                    p.value,
                  );
                } else {
                  fm.document.locale = value;
                }
              }
              break;
            }
          }
        });
        break;
    }
  });

  if (fm.changelog === undefined) {
    ctx.report(
      "changelog-required",
      "error",
      'Frontmatter must declare the format version: `changelog: "0.1"`',
    );
    fm.valid = false;
  }
  if (fm.document.coverage === "partial" && fm.document.older === undefined) {
    ctx.report(
      "older-required",
      "error",
      "`document.older` is required when `document.coverage` is `partial`",
    );
  }
  if (
    fm.product.name !== undefined &&
    fm.product.id === undefined &&
    slugProductName(fm.product.name) === undefined
  ) {
    ctx.report(
      "id-required",
      "error",
      `\`product.name\` \`${fm.product.name}\` reduces to nothing under the id algorithm — an explicit \`product.id\` is required`,
    );
  }

  return fm;
}
