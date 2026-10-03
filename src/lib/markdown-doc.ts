/**
 * Markdown 文档的纯函数：tiptap JSON → Markdown 一次性迁移、
 * 旧内容归一化、摘要提取。无外部依赖，可在 node 单测中直接跑。
 *
 * tiptap → Markdown 的具体转换住在共享的 `./tiptap-to-markdown.mjs`，
 * 主进程的 documents.mjs 也用同一份，保证迁移结果一致。
 */
import { legacyJsonToMarkdown, tiptapToMarkdown } from "./tiptap-to-markdown.mjs";

export { tiptapToMarkdown };

/** Minimal shape of the old tiptap JSON documents, for one-way migration. */
export interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: TiptapNode[];
}

/**
 * Accept both the new Markdown string and legacy tiptap JSON.
 * Legacy server-migration docs (`doc-legacy-server-*`) wrapped the whole
 * Markdown source in a single code block — unwrap it verbatim instead of
 * fencing it again.
 */
export function normalizeContent(content: unknown, id = ""): string {
  if (typeof content === "string") return content;
  return legacyJsonToMarkdown(content, id) ?? "";
}

const IMAGE_PATTERN = /!\[[^\]\n]*\]\(\s*[^\s)]+/g;

/** Count inline images in Markdown source. */
export function countMarkdownImages(markdown: string): number {
  return (markdown.match(IMAGE_PATTERN) ?? []).length;
}

/** Strip Markdown syntax down to plain text for list excerpts. */
export function markdownExcerpt(markdown: string, maxLength = 180): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/!\[[^\]\n]*\]\(\s*[^\s)]+(?:\s+"[^"]*")?\s*\)/g, "")
    .replace(/\[([^\]\n]*)\]\(\s*[^\s)]+(?:\s+"[^"]*")?\s*\)/g, "$1")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/[#>*_~|\-[\]()!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
