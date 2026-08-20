import type { Node, Parent } from "mdast";
import type { Diagnostic } from "../diagnostics.js";
import { pos } from "../parse/document.js";
import type { ChangelogModel } from "../parse/document.js";

export function checkMedia(model: ChangelogModel): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const entry of model.entries) {
    walk(entry.allNodes, (node) => {
      if (node.type === "image") {
        const alt = (node as { alt?: string | null }).alt;
        if (!alt || alt.trim() === "") {
          out.push({
            rule: "media/image-alt",
            severity: "warning",
            message:
              "Image without meaningful alt text — consumers routinely render images as their alt text alone",
            position: pos(node as Parameters<typeof pos>[0]),
          });
        }
      } else if (node.type === "html") {
        out.push({
          rule: "media/raw-html",
          severity: "warning",
          message:
            "Raw HTML should not appear — a consumer that sanitizes it will remove it; one that does not has a vulnerability",
          position: pos(node as Parameters<typeof pos>[0]),
        });
      }
    });
  }
  return out;
}

function walk(nodes: readonly Node[], visit: (node: Node) => void): void {
  for (const node of nodes) {
    visit(node);
    const children = (node as Parent).children;
    if (Array.isArray(children)) walk(children, visit);
  }
}
