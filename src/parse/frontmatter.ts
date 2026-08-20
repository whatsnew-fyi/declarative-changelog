import { parseDocument } from "yaml";
import { COVERAGE_VALUES, FRONTMATTER_KEYS, PLATFORM_TAGS, SPEC_VERSION } from "../constants.js";
import type { Diagnostic, LineIndex } from "../diagnostics.js";
import { parseIsoDate } from "./date.js";
import { asString, asStringList, asUrl, eachPair, isMap, YamlContext } from "./yaml-utils.js";

export interface Frontmatter {
  changelog?: string;
  product: {
    name?: string;
    vendor?: string;
    homepage?: string;
    id?: string;
    description?: string;
    platforms?: string[];
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

export function parseFrontmatter(
  yamlText: string,
  baseOffset: number,
  lines: LineIndex,
  diagnostics: Diagnostic[],
): Frontmatter {
  const fm: Frontmatter = { product: {}, document: {}, valid: true };
  const ctx = new YamlContext(baseOffset, lines, diagnostics, "frontmatter");
  const doc = parseDocument(yamlText);

  if (ctx.yamlErrors(doc, "invalid-yaml") || !isMap(doc.contents)) {
    if (!isMap(doc.contents) && doc.errors.length === 0) {
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
          if (value !== SPEC_VERSION) {
            ctx.report(
              "unsupported-version",
              "warning",
              `Unsupported format version \`${value}\` — validating as ${SPEC_VERSION}`,
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
        eachPair(ctx, pair.value, FRONTMATTER_KEYS.product, "product", "warning", (k, p) => {
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
                fm.product[k as "name" | "vendor" | "id" | "description" | "category"] = value;
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
        eachPair(ctx, pair.value, FRONTMATTER_KEYS.document, "document", "warning", (k, p) => {
          switch (k) {
            case "updated": {
              const value = asString(ctx, p, "document.updated");
              if (value !== undefined) {
                const date = parseIsoDate(value);
                if (!date?.valid) {
                  ctx.report(
                    "invalid-timestamp",
                    "error",
                    `\`document.updated\` is not an ISO 8601 timestamp: \`${value}\``,
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

  return fm;
}
