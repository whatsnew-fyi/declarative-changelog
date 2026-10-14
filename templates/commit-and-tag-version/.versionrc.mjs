// commit-and-tag-version configuration that writes a Declarative Changelog
// (https://whatsnew.fyi/spec). Save it as .versionrc.mjs. Needs
// commit-and-tag-version 13 or later, on Node 22.12 or later.
//
// `header` writes the frontmatter and the title on every release, and
// commit-and-tag-version keeps the file from its first release heading down,
// so start from an empty or missing CHANGELOG.md, or run once with
// `--release-count 0` to write every release from the tags. Keep the title
// something other than `# Changelog`: commit-and-tag-version copies whatever
// sits above that line, and the frontmatter would appear twice.
//
// Commit types map to the format's six categories. `security`, `deprecate`
// and `remove` are extensions: stock Conventional Commits has no type for
// them. A breaking commit of a hidden type (docs, style, refactor, test,
// build, ci, chore) shows under Changed, and a release of nothing but hidden
// types is tagged `(routine)`.

const CATEGORIES = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];
const HIDDEN = ["docs", "style", "refactor", "test", "build", "ci", "chore"];

const types = [
  { type: "feat", section: "Added" },
  { type: "perf", section: "Changed" },
  { type: "revert", section: "Changed" },
  { type: "deprecate", section: "Deprecated" },
  { type: "remove", section: "Removed" },
  { type: "fix", section: "Fixed" },
  { type: "security", section: "Security" },
  ...HIDDEN.map((type) => ({ type, section: "Changed", hidden: true })),
];

const timestamp = (date) => new Date(date).toISOString().replace(/\.\d{3}Z$/, "Z");
const upperFirst = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Edit for your product.
const header = `---
changelog: "0.1"
product:
  name: Kestrel
  homepage: https://github.com/acme/kestrel
  versioning: semver
document:
  updated: ${timestamp(new Date())}
  canonical: https://github.com/acme/kestrel/blob/main/CHANGELOG.md
---

# Kestrel changelog
`;

function transform(commit, context) {
  const type = commit.revert ? "revert" : commit.type?.toLowerCase();
  const entry = types.find((candidate) => candidate.type === type);
  const notes = commit.notes
    .filter((note) => /^BREAKING[ -]CHANGES?$/i.test(note.title))
    .map((note) => note.text.trim());
  const breaking = notes.length > 0 || /^\w+(\([^)]*\))?!:/.test(commit.header ?? "");
  if (!entry || (entry.hidden && !breaking)) return undefined;

  const repo = context.repoUrl;
  let subject = upperFirst(commit.subject ?? commit.header ?? "");
  if (repo) subject = subject.replace(/(^|[\s(])#(\d+)\b/g, `$1[#$2](${repo}/issues/$2)`);
  const marker = breaking ? "**Breaking** — " : "";
  const scope = commit.scope ? `**${commit.scope}:** ` : "";
  const hash = commit.hash ?? "";
  const link = repo ? `([${hash.slice(0, 7)}](${repo}/commit/${hash}))` : `(${hash.slice(0, 7)})`;
  // A BREAKING CHANGE footer that says more than the subject.
  const detail = notes.find((text) => text && text !== commit.subject);
  return {
    type: entry.section,
    line: `- ${marker}${scope}${subject} ${link}${detail ? `\n  - ${upperFirst(detail)}` : ""}`,
  };
}

function template(context) {
  const repo = context.repoUrl;
  const tag = context.currentTag || `v${context.version}`;
  const label = repo ? `[${context.version}](${repo}/releases/tag/${tag})` : context.version;
  const routine = context.commitGroups.length === 0 ? " (routine)" : "";
  const lines = [`## ${label} - ${context.date}${routine}`];
  for (const group of context.commitGroups) {
    lines.push("", `### ${group.title}`, "", ...group.commits.map((commit) => commit.line));
  }
  return lines.join("\n");
}

export default {
  types,
  header,
  writer: {
    transform,
    groupBy: "type",
    commitGroupsSort: (a, b) => CATEGORIES.indexOf(a.title) - CATEGORIES.indexOf(b.title),
    commitsSort: false,
    formatDate: timestamp,
    template,
  },
};
