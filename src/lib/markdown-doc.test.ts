import test from "node:test";
import assert from "node:assert/strict";
import {
  tiptapToMarkdown,
  normalizeContent,
  markdownExcerpt,
  countMarkdownImages,
} from "./markdown-doc.ts";

test("tiptap 段落与行内格式转为 Markdown", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "标题" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "粗", marks: [{ type: "bold" }] },
          { type: "text", text: "斜", marks: [{ type: "italic" }] },
          {
            type: "text",
            text: "链",
            marks: [{ type: "link", attrs: { href: "https://example.com" } }],
          },
          { type: "text", text: "码", marks: [{ type: "code" }] },
        ],
      },
    ],
  };
  assert.equal(
    tiptapToMarkdown(doc),
    "## 标题\n\n**粗***斜*[链](https://example.com)`码`",
  );
});

test("tiptap 列表、引用、代码块、图片转为 Markdown", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 3 },
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "c" }] }] },
        ],
      },
      {
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text: "引" }] }],
      },
      { type: "codeBlock", content: [{ type: "text", text: "x = 1\n" }] },
      { type: "paragraph", content: [{ type: "image", attrs: { src: "https://x/y.png", alt: "图" } }] },
      { type: "horizontalRule" },
    ],
  };
  assert.equal(
    tiptapToMarkdown(doc),
    "- a\n- b\n\n3. c\n\n> 引\n\n```\nx = 1\n```\n\n![图](https://x/y.png)\n\n---",
  );
});

test("normalizeContent 兼容三种输入", () => {
  assert.equal(normalizeContent("# 已存在"), "# 已存在");
  assert.equal(
    normalizeContent(
      {
        type: "doc",
        content: [{ type: "codeBlock", content: [{ type: "text", text: "# 原文" }] }],
      },
      "doc-legacy-server-abc",
    ),
    "# 原文",
  );
  assert.equal(
    normalizeContent({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    }),
    "hi",
  );
  assert.equal(normalizeContent(null), "");
  assert.equal(normalizeContent(42), "");
});

test("摘要提取去掉 Markdown 语法并计数图片", () => {
  const md = "# 标题\n\n![a](https://x/1.png) 正文 [链接](https://e.com) `代码`";
  assert.equal(countMarkdownImages(md), 1);
  assert.equal(markdownExcerpt(md), "标题 正文 链接");
  assert.equal(countMarkdownImages("无图"), 0);
});
