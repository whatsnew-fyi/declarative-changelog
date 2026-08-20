import { parseDocument } from "yaml";
import { ESCAPE_HATCH_KEYS, PLATFORM_TAGS } from "../constants.js";
import type { Diagnostic, LineIndex, Position } from "../diagnostics.js";
import { parseIsoDate } from "./date.js";
import { parseVersion } from "./version.js";
import {
  asBoolean,
  asString,
  asStringList,
  asUrl,
  eachPair,
  isMap,
  YamlContext,
} from "./yaml-utils.js";

export interface EscapeHatch {
  channel?: string;
  url?: string;
  prerelease?: boolean;
  platforms?: string[];
  covers?: string[];
  supersededBy?: string;
  id?: string;
  version?: string;
  title?: string;
  date?: string;
  position: Position;
}

/**
 * Parses a ```changelog fenced block. `baseOffset` is the file offset where
 * the YAML content starts (after the opening fence line).
 */
export function parseEscapeHatch(
  yamlText: string,
  baseOffset: number,
  position: Position,
  lines: LineIndex,
  diagnostics: Diagnostic[],
): EscapeHatch {
  const hatch: EscapeHatch = { position };
  const ctx = new YamlContext(baseOffset, lines, diagnostics, "hatch");
  const doc = parseDocument(yamlText);

  if (ctx.yamlErrors(doc, "invalid-yaml")) return hatch;
  if (!isMap(doc.contents)) {
    diagnostics.push({
      rule: "hatch/invalid-yaml",
      severity: "error",
      message: "The escape hatch must be a YAML map",
      position,
    });
    return hatch;
  }

  eachPair(ctx, doc.contents, ESCAPE_HATCH_KEYS, "the escape hatch", "error", (key, pair) => {
    switch (key) {
      case "channel":
        hatch.channel = asString(ctx, pair, "channel");
        break;
      case "url":
        hatch.url = asUrl(ctx, pair, "url");
        break;
      case "prerelease":
        hatch.prerelease = asBoolean(ctx, pair, "prerelease");
        break;
      case "platforms": {
        const platforms = asStringList(ctx, pair, "platforms");
        if (platforms) {
          for (const platform of platforms) {
            if (!(PLATFORM_TAGS as readonly string[]).includes(platform)) {
              ctx.report(
                "unknown-platform",
                "error",
                `Unknown platform \`${platform}\` — known platforms: ${PLATFORM_TAGS.join(", ")}`,
                pair.value,
              );
            }
          }
          hatch.platforms = platforms;
        }
        break;
      }
      case "covers":
        hatch.covers = asStringList(ctx, pair, "covers");
        break;
      case "superseded-by":
        hatch.supersededBy = asString(ctx, pair, "superseded-by");
        break;
      case "id":
        hatch.id = asString(ctx, pair, "id");
        break;
      case "version": {
        const version = asString(ctx, pair, "version");
        if (version !== undefined) {
          if (!parseVersion(version)) {
            ctx.report(
              "invalid-version",
              "error",
              `\`version\` does not match the version grammar: \`${version}\``,
              pair.value,
            );
          } else {
            hatch.version = version;
          }
        }
        break;
      }
      case "title":
        hatch.title = asString(ctx, pair, "title");
        break;
      case "date": {
        const date = asString(ctx, pair, "date");
        if (date !== undefined) {
          const parsed = parseIsoDate(date);
          if (!parsed?.valid) {
            ctx.report(
              "invalid-date",
              "error",
              `\`date\` is not a valid ISO 8601 date: \`${date}\``,
              pair.value,
            );
          } else {
            hatch.date = date;
          }
        }
        break;
      }
    }
  });

  return hatch;
}
