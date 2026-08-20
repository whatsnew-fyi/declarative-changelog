import type { Node, Parent } from "mdast";

function hasChildren(node: Node): node is Parent {
  return Array.isArray((node as Parent).children);
}

/**
 * Flattens inline markup to plain text: links become their text, code spans
 * their contents, emphasis is removed, images become their alt text.
 */
export function flattenInline(nodes: readonly Node[]): string {
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
      case "inlineCode":
        out += (node as unknown as { value: string }).value;
        break;
      case "image":
        out += (node as { alt?: string | null }).alt ?? "";
        break;
      case "break":
        out += " ";
        break;
      case "html":
        break;
      default:
        if (hasChildren(node)) out += flattenInline(node.children);
        break;
    }
  }
  return out;
}
