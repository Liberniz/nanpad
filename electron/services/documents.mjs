import { hostedImageUrl } from "./hosted-image.mjs";
import { mkdir, readFile, readdir, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { inspectRaster } from "./image-data.mjs";
import { legacyJsonToMarkdown } from "../../src/lib/tiptap-to-markdown.mjs";

const KINDS = new Set(["server", "domain", "mail", "ai", "secret", "cert"]);
export function documentLink(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/** Fenced code blocks and inline code are literal text, not links/images. */
function stripCode(markdown) {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, "")
    .replace(/`[^`\n]*`/g, "");
}
const IMAGE_PATTERN = /!\[[^\]\n]*\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/g;
/** [text](target) — but not ![alt](src). Only absolute-URL-looking targets are checked. */
const LINK_PATTERN = /(?<!!)\[[^\]\n]*\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/g;
function looksAbsoluteUrl(target) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith("//");
}
function checkImageSrc(src) {
  const match =
    typeof src === "string" && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
  if (match) {
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 2 * 1024 * 1024 || bytes.toString("base64") !== match[2])
      throw new Error("图片编码无效或超过 2 MiB");
    const size = inspectRaster(bytes, "image/" + match[1]);
    if (Math.max(size.width, size.height) > 2048) throw new Error("图片最长边不能超过 2048 像素");
    return;
  }
  if (!hostedImageUrl(src)) throw new Error("图片必须是上传图片或 HTTPS 图床地址，不支持 SVG");
}
export function normalizeDocument(input) {
  if (!input || typeof input !== "object" || !/^doc-[a-zA-Z0-9-]{1,80}$/.test(input.id))
    throw new Error("文档标识无效");
  if (JSON.stringify(input).length > 16 * 1024 * 1024) throw new Error("单篇文档不能超过 16 MiB");
  // Old tiptap JSON bodies are migrated to Markdown on the way in, so a
  // document written by an older build keeps working without a separate step.
  let content = input.content;
  if (typeof content !== "string") {
    const migrated = legacyJsonToMarkdown(content, input.id);
    if (migrated === null) throw new Error("文档正文必须是 Markdown 文本");
    content = migrated;
  }
  // Validate embedded images and absolute links, ignoring code spans/blocks.
  const text = stripCode(content);
  for (const match of text.matchAll(IMAGE_PATTERN)) checkImageSrc(match[1]);
  for (const match of text.matchAll(LINK_PATTERN)) {
    const target = match[1];
    if (looksAbsoluteUrl(target) && !documentLink(target))
      throw new Error("链接只支持 HTTP 或 HTTPS");
  }
  const seen = new Set();
  const bindings = (Array.isArray(input.bindings) ? input.bindings : [])
    .map((ref) => {
      if (!KINDS.has(ref?.kind) || typeof ref.id !== "string" || !ref.id || ref.id.length > 256)
        throw new Error("关联资产无效");
      return { kind: ref.kind, id: ref.id };
    })
    .filter((ref) => {
      const key = JSON.stringify(ref);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (bindings.length > 100) throw new Error("单篇文档最多关联 100 项资产");
  return {
    id: input.id,
    title:
      String(input.title ?? "")
        .trim()
        .slice(0, 160) || "未命名文档",
    content,
    bindings,
  };
}
export function documentSummary(doc) {
  const markdown = typeof doc.content === "string" ? doc.content : "";
  const imageCount = (markdown.match(/!\[[^\]\n]*\]\(\s*[^\s)]+/g) ?? []).length;
  const excerpt = stripCode(markdown)
    .replace(/!\[[^\]\n]*\]\(\s*[^\s)]+(?:\s+"[^"]*")?\s*\)/g, "")
    .replace(/\[([^\]\n]*)\]\(\s*[^\s)]+(?:\s+"[^"]*")?\s*\)/g, "$1")
    .replace(/[#>*_~`|\-[\]()!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return {
    id: doc.id,
    title: doc.title,
    bindings: doc.bindings,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    excerpt,
    imageCount,
  };
}
export class DocumentsStore {
  #directory;
  #queue = Promise.resolve();
  constructor(directory) {
    this.#directory = directory;
  }
  #path(id) {
    if (!/^doc-[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error("文档标识无效");
    return join(this.#directory, id + ".json");
  }
  async list() {
    await this.#queue;
    let names;
    try {
      names = await readdir(this.#directory);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const result = [];
    for (const name of names.filter((n) => /^doc-[a-zA-Z0-9-]{1,80}\.json$/.test(n)))
      result.push(documentSummary(await this.get(name.slice(0, -5))));
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id) {
    await this.#queue;
    const doc = JSON.parse(await readFile(this.#path(id), "utf8"));
    return { ...normalizeDocument(doc), createdAt: doc.createdAt, updatedAt: doc.updatedAt };
  }
  save(input) {
    const clean = normalizeDocument(input);
    const createOnly = input.createOnly === true;
    const job = this.#queue.then(async () => {
      const path = this.#path(clean.id);
      let createdAt = new Date().toISOString();
      try {
        const existing = JSON.parse(await readFile(path, "utf8"));
        // 显式迁移只创建缺失文档，队列内检查避免并发导入覆盖用户后续编辑。
        if (createOnly)
          return {
            ...normalizeDocument(existing),
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
          };
        createdAt = existing.createdAt || createdAt;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const doc = { ...clean, createdAt, updatedAt: new Date().toISOString() };
      await mkdir(this.#directory, { recursive: true });
      await writeFile(path + ".tmp", JSON.stringify(doc), "utf8");
      await rename(path + ".tmp", path);
      return doc;
    });
    this.#queue = job.catch(() => {});
    return job;
  }
  remove(id) {
    const path = this.#path(id);
    const job = this.#queue.then(() => unlink(path));
    this.#queue = job.catch(() => {});
    return job;
  }
}
