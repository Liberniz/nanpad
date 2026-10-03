/**
 * Old tiptap JSON documents → Markdown source, one way.
 *
 * Shared as plain `.mjs` so both the renderer (`src/lib/markdown-doc.ts`)
 * and the Electron main process (`electron/services/documents.mjs`) use the
 * same migration. No dependencies, no DOM.
 */

/** @typedef {{type?: string, text?: string, attrs?: Record<string, unknown>, marks?: Array<{type?: string, attrs?: Record<string, unknown>}>, content?: TiptapNode[]}} TiptapNode */
/** @typedef {TiptapNode[]} TiptapNodeList */

/** @param {TiptapNode} node @returns {string} */
function inlineChildren(node) {
  return (node.content ?? []).map(inlineNode).join("");
}

/** @param {TiptapNode} node @returns {string} */
function inlineNode(node) {
  if (node.type === "text") {
    let text = node.text ?? "";
    for (const mark of node.marks ?? []) {
      const href =
        mark.type === "link" && typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
      if (mark.type === "bold") text = `**${text}**`;
      else if (mark.type === "italic") text = `*${text}*`;
      else if (mark.type === "strike") text = `~~${text}~~`;
      else if (mark.type === "code") text = `\`${text}\``;
      else if (mark.type === "underline") text = `<u>${text}</u>`;
      else if (href) text = `[${text}](${href})`;
    }
    return text;
  }
  if (node.type === "hardBreak") return "  \n";
  if (node.type === "image") {
    const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
    const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt.replace(/[[\]]/g, "") : "";
    return `![${alt}](${src})`;
  }
  return inlineChildren(node);
}

/** @param {TiptapNode} item @returns {string[]} */
function listItemLines(item) {
  const lines = /** @type {string[]} */ ([]);
  for (const child of item.content ?? []) {
    if (child.type === "paragraph" || child.type === "heading") {
      const text = inlineChildren(child);
      if (text) lines.push(text);
    } else if (child.type === "bulletList" || child.type === "orderedList") {
      for (const line of listLines(child)) lines.push("  " + line);
    } else {
      const text = blockNode(child);
      if (text) lines.push(text);
    }
  }
  return lines.length ? lines : [""];
}

/** @param {TiptapNode} node @param {string} indent @returns {string[]} */
function listLines(node, indent = "") {
  const lines = /** @type {string[]} */ ([]);
  const ordered = node.type === "orderedList";
  const start = /** @type {unknown} */ (node.attrs?.start);
  let n = ordered && Number.isInteger(start) && /** @type {number} */ (start) > 0 ? /** @type {number} */ (start) : 1;
  for (const item of node.content ?? []) {
    const itemLines = listItemLines(item);
    itemLines.forEach((line, index) => {
      const prefix = index === 0 ? (ordered ? `${n}. ` : "- ") : "  ";
      lines.push(indent + prefix + line);
    });
    if (ordered) n++;
  }
  return lines;
}

/** @param {TiptapNode} node @returns {string} */
function blockNode(node) {
  switch (node.type) {
    case "paragraph":
      return inlineChildren(node);
    case "heading": {
      const level = node.attrs?.level === 1 || node.attrs?.level === 3 ? node.attrs.level : 2;
      return `${"#".repeat(level)} ${inlineChildren(node)}`;
    }
    case "bulletList":
    case "orderedList":
      return listLines(node).join("\n");
    case "blockquote": {
      const inner = (node.content ?? []).map(blockNode).filter(Boolean).join("\n");
      return inner
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    }
    case "codeBlock": {
      const text = inlineChildren(node).replace(/\n$/, "");
      return `\`\`\`\n${text}\n\`\`\``;
    }
    case "horizontalRule":
      return "---";
    case "image":
      return inlineNode(node);
    default:
      return (node.content ?? []).map(blockNode).filter(Boolean).join("\n\n");
  }
}

/** One-way conversion of the old tiptap JSON documents to Markdown source. */
/** @param {unknown} root @returns {string} */
export function tiptapToMarkdown(root) {
  if (!root || typeof root !== "object") return "";
  const node = /** @type {TiptapNode} */ (root);
  const blocks = node.type === "doc" ? (node.content ?? []) : [node];
  return blocks
    .map(blockNode)
    .filter(/** @param {string} text */ (text) => text !== "")
    .join("\n\n");
}

/**
 * Convert a legacy JSON document body to Markdown. Returns null when the
 * value is not a recognizable tiptap document.
 *
 * Legacy server-migration docs (`doc-legacy-server-*`) wrapped the whole
 * Markdown source in a single code block — unwrap it verbatim instead of
 * fencing it again.
 */
/** @param {unknown} content @param {string} id @returns {string | null} */
export function legacyJsonToMarkdown(content, id = "") {
  if (!content || typeof content !== "object") return null;
  try {
    const node = /** @type {TiptapNode} */ (content);
    if (
      id.startsWith("doc-legacy-server-") &&
      node?.type === "doc" &&
      node.content?.length === 1 &&
      node.content[0].type === "codeBlock"
    ) {
      return (node.content[0].content ?? []).map((child) => child.text ?? "").join("");
    }
    if (node.type !== "doc" || !Array.isArray(node.content)) return null;
    return tiptapToMarkdown(node);
  } catch {
    return null;
  }
}
