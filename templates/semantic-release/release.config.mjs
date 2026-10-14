// semantic-release configuration that writes a Declarative Changelog
// (https://whatsnew.fyi/spec). Needs semantic-release 24 or later, with
// @semantic-release/changelog and @semantic-release/git installed.
//
// Commit types map to the format's six categories. `security`, `deprecate`
// and `remove` are extensions: stock Conventional Commits has no type for
// them, so they get release rules here. A breaking commit of a hidden type
// (docs, style, refactor, test, build, ci, chore) shows under Changed, and a
// release of nothing but hidden types, if a rule of yours makes one, is tagged
// `(routine)`.

// Edit for your product. semantic-release finds this text at the top of the
// file to know where the old entries start, so it carries no date.
const TITLE = `---
changelog: "0.1"
product:
  name: Kestrel
  homepage: https://github.com/acme/kestrel
  versioning: semver
document:
  canonical: https://github.com/acme/kestrel/blob/main/CHANGELOG.md
---

# Kestrel changelog`;

const CATEGORIES = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];
const SECTIONS = {
  feat: "Added",
  perf: "Changed",
  revert: "Changed",
  deprecate: "Deprecated",
  remove: "Removed",
  fix: "Fixed",
  security: "Security",
};

// Conventional Commits, including `!`, which the default Angular parser misses.
const parserOpts = {
  headerPattern: /^(\w*)(?:\((.*)\))?!?: (.*)$/,
  breakingHeaderPattern: /^(\w*)(?:\((.*)\))?!: (.*)$/,
  headerCorrespondence: ["type", "scope", "subject"],
  noteKeywords: ["BREAKING CHANGE", "BREAKING-CHANGE"],
  revertPattern: /^(?:Revert|revert:)\s"?([\s\S]+?)"?\s*This reverts commit (\w*)\./i,
  revertCorrespondence: ["header", "hash"],
};

const upperFirst = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const repoUrl = (context) => `${context.host}/${context.owner}/${context.repository}`;

const writerOpts = {
  transform(commit, context) {
    const type = commit.revert ? "revert" : commit.type?.toLowerCase();
    const notes = commit.notes.map((note) => note.text.trim());
    const breaking = notes.length > 0;
    const section = SECTIONS[type] ?? (breaking ? "Changed" : undefined);
    if (!section) return undefined;

    const repo = repoUrl(context);
    const subject = upperFirst(commit.subject ?? commit.header ?? "").replace(
      /(^|[\s(])#(\d+)\b/g,
      `$1[#$2](${repo}/issues/$2)`,
    );
    const marker = breaking ? "**Breaking** — " : "";
    const scope = commit.scope ? `**${commit.scope}:** ` : "";
    const link = `([${commit.hash.slice(0, 7)}](${repo}/commit/${commit.hash}))`;
    // A BREAKING CHANGE footer that says more than the subject.
    const detail = notes.find((text) => text && text !== commit.subject);
    return {
      type: section,
      line: `- ${marker}${scope}${subject} ${link}${detail ? `\n  - ${upperFirst(detail)}` : ""}`,
    };
  },
  groupBy: "type",
  commitGroupsSort: (a, b) => CATEGORIES.indexOf(a.title) - CATEGORIES.indexOf(b.title),
  commitsSort: false,
  formatDate: (date) => new Date(date).toISOString().replace(/\.\d{3}Z$/, "Z"),
  finalizeContext(context) {
    const routine = context.commitGroups.length === 0 ? " (routine)" : "";
    const label = `[${context.version}](${repoUrl(context)}/releases/tag/${context.currentTag})`;
    return { ...context, heading: `## ${label} - ${context.date}${routine}` };
  },
  mainTemplate: `{{heading}}
{{#each commitGroups}}

### {{title}}

{{#each commits}}
{{line}}
{{/each}}
{{/each}}
`,
};

export default {
  branches: ["main"],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        parserOpts,
        // A commit that matches any rule here skips the default rules, so the
        // breaking rule is restated.
        releaseRules: [
          { breaking: true, release: "major" },
          { type: "security", release: "patch" },
          { type: "deprecate", release: "patch" },
          { type: "remove", release: "patch" },
        ],
      },
    ],
    ["@semantic-release/release-notes-generator", { parserOpts, writerOpts }],
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md", changelogTitle: TITLE }],
    ["@semantic-release/git", { assets: ["CHANGELOG.md"] }],
    "@semantic-release/github",
  ],
};
