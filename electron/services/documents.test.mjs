import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DocumentsStore, normalizeDocument, documentLink } from "./documents.mjs";
const doc = () => ({
  id: "doc-test",
  title: "部署说明",
  content: "# 部署说明\n\n[查看文档](https://example.com)\n",
  bindings: [],
});
test("文档独立保存、跨重启读取、多资产绑定和解除", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nanpad-docs-"));
  try {
    const store = new DocumentsStore(dir);
    const saved = await store.save(doc());
    assert.equal((await store.list())[0].excerpt, "部署说明 查看文档");
    await store.save({
      ...saved,
      bindings: [
        { kind: "server", id: "s1" },
        { kind: "ai", id: "a1" },
        { kind: "ai", id: "a1" },
      ],
    });
    const restarted = new DocumentsStore(dir);
    assert.equal((await restarted.get(saved.id)).bindings.length, 2);
    await restarted.save({ ...(await restarted.get(saved.id)), bindings: [] });
    assert.deepEqual((await restarted.get(saved.id)).bindings, []);
    await restarted.remove(saved.id);
    assert.deepEqual(await restarted.list(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("文档并发写入有序，失败不会阻塞后续保存", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nanpad-docs-"));
  try {
    const store = new DocumentsStore(dir);
    await Promise.all([
      store.save({ ...doc(), title: "一" }),
      store.save({ ...doc(), title: "二" }),
    ]);
    assert.equal((await store.get("doc-test")).title, "二");
    assert.throws(() => store.save({ ...doc(), id: "../secrets" }));
    await store.save({ ...doc(), title: "三" });
    assert.equal((await store.get("doc-test")).title, "三");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("文档拒绝危险链接、外部图片、非文本正文和路径穿越", () => {
  assert.equal(documentLink("javascript:alert(1)"), null);
  assert.equal(documentLink("https://user:pass@example.com"), null);
  assert.throws(() => normalizeDocument({ ...doc(), id: "doc-../../secret" }));
  assert.throws(() => normalizeDocument({ ...doc(), content: { type: "doc" } }));
  assert.throws(() => normalizeDocument({ ...doc(), content: "[x](javascript:alert(1))" }));
  assert.throws(() =>
    normalizeDocument({ ...doc(), content: "![a](https://example.com/a.png)" }),
  );
  // 代码块里的写法是字面文本，不应被校验拦截。
  assert.doesNotThrow(() =>
    normalizeDocument({ ...doc(), content: "```\n![a](https://example.com/a.png)\n```" }),
  );
});
test("文档图片保存保留真实 PNG 与摘要", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nanpad-docs-"));
  try {
    const store = new DocumentsStore(dir);
    const src =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZZkAAAAASUVORK5CYII=";
    await store.save({ ...doc(), content: `# 图\n\n![pixel](${src})\n` });
    assert.equal((await store.list())[0].imageCount, 1);
    assert.match((await store.get("doc-test")).content, /!\[pixel\]\(data:image\/png/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("迁移只创建一次，不覆盖已编辑和已解绑的文档", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nanpad-docs-import-"));
  try {
    const store = new DocumentsStore(dir);
    const first = await store.save({ ...doc(), createOnly: true });
    const edited = await store.save({ ...first, title: "用户新标题", bindings: [] });
    const repeated = await store.save({
      ...doc(),
      createOnly: true,
      bindings: [{ kind: "server", id: "s1" }],
    });
    assert.deepEqual(repeated, edited);
    assert.equal("createOnly" in repeated, false);
    assert.equal((await store.list()).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("并发迁移请求保留首次保存的内容", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nanpad-docs-import-"));
  try {
    const store = new DocumentsStore(dir);
    const [first, second] = await Promise.all([
      store.save({ ...doc(), title: "首次内容", createOnly: true }),
      store.save({ ...doc(), title: "稍后内容", createOnly: true }),
    ]);
    assert.deepEqual(second, first);
    assert.equal((await store.get(first.id)).title, "首次内容");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
