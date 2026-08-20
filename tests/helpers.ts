import { parseChangelog, validateChangelog } from "../src/index.js";

export const FRONTMATTER = `---
changelog: "0.1"
product:
  name: Kestrel
document:
  canonical: https://kestrel.example/changelog
---`;

/** Wraps a body in minimal conformant frontmatter and a title. */
export function doc(body: string, frontmatter = FRONTMATTER): string {
  return `${frontmatter}\n\n# Kestrel changelog\n\n${body}\n`;
}

export function validate(body: string, frontmatter?: string) {
  return validateChangelog(doc(body, frontmatter), "test.md");
}

export function parse(body: string, frontmatter?: string) {
  return parseChangelog(doc(body, frontmatter), "test.md");
}

export function rules(body: string, frontmatter?: string): string[] {
  return validate(body, frontmatter).diagnostics.map((d) => d.rule);
}
