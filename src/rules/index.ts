import type { Diagnostic } from "../diagnostics.js";
import type { ChangelogModel } from "../parse/document.js";
import { checkEntries } from "./entry.js";
import { checkHeadings } from "./heading.js";
import { checkIdentity } from "./identity.js";
import { checkMedia } from "./media.js";
import { type RelationContext, checkRelations } from "./relations.js";
import { checkVersionContent } from "./version-content.js";

export type { ArchiveIdentifiers, RelationContext } from "./relations.js";

export function runRules(model: ChangelogModel, ctx: RelationContext = {}): Diagnostic[] {
  return [
    ...checkHeadings(model),
    ...checkIdentity(model),
    ...checkEntries(model),
    ...checkRelations(model, ctx),
    ...checkMedia(model),
    ...checkVersionContent(model),
  ];
}
