import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DocumentsStore, normalizeDocument } from "../electron/services/documents.mjs";
const migration = await import("../src/lib/document-migration.mjs").catch((error) => {
  if (error.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});
const server = () => ({
  id: "服务器/旧:id-1",
  name: "生产服务器",
  docs: "# 维护\r\n\r\n```bash\r\nprintf '$HOME'\r\n```\r\n[资料](https://example.test/a?q=1)\r\n![截图](https://example.test/a.png)\r\n",
});
function api() {
  assert.equal(typeof migration.migrateServerDocument, "function", "缺少旧文档迁移能力");
  return migration;
}
test("旧Markdown、代码、链接和换行原样迁移，ID适配文档存储", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nanpad-legacy-docs-"));
  try {
    const source = server();
    const original = structuredClone(source);
    const store = new DocumentsStore(directory);
    const result = await api().migrateServerDocument(source, store);
    assert.equal(result.content.content[0].type, "codeBlock");
    assert.equal(result.content.content[0].content[0].text, source.docs);
    assert.deepEqual(result.bindings, [{ kind: "server", id: source.id }]);
    assert.match(result.id, /^doc-legacy-server-[a-f0-9]{64}$/);
    assert.doesNotThrow(() => normalizeDocument(result));
    assert.deepEqual(source, original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("再次迁移返回现有编辑内容且保留解绑，不重复生成文档", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nanpad-legacy-docs-"));
  try {
    const store = new DocumentsStore(directory);
    const source = server();
    const first = await api().migrateServerDocument(source, store);
    const edited = await store.save({
      ...first,
      title: "我重新编辑过",
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "新内容" }] }],
      },
      bindings: [],
    });
    const again = await api().migrateServerDocument(
      { ...source, name: "已改名", docs: "旧字段又变化" },
      store,
    );
    assert.deepEqual(again, edited);
    assert.equal((await store.list()).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("服务器ID不同不会碰撞，长ID和Unicode均可迁移", async () => {
  const documents = [];
  const store = {
    save: async (document) => {
      documents.push(document);
      return document;
    },
  };
  const first = await api().migrateServerDocument(server(), store);
  const second = await api().migrateServerDocument({ ...server(), id: "界".repeat(250) }, store);
  assert.notEqual(first.id, second.id);
  assert.equal(documents.length, 2);
  assert.equal(
    documents.every((document) => document.createOnly === true),
    true,
  );
});
test("迁移保存失败原文不变，可按相同ID重试", async () => {
  const source = server();
  const before = structuredClone(source);
  const ids = [];
  const store = {
    save: async (document) => {
      ids.push(document.id);
      throw new Error("disk full");
    },
  };
  await assert.rejects(api().migrateServerDocument(source, store), /disk full/);
  await assert.rejects(api().migrateServerDocument(source, store), /disk full/);
  assert.deepEqual(source, before);
  assert.equal(ids[0], ids[1]);
});
test("空旧文档拒绝迁移，避免生成虚假内容", async () => {
  let saves = 0;
  await assert.rejects(
    api().migrateServerDocument(
      { ...server(), docs: "  " },
      {
        save: async () => {
          saves++;
        },
      },
    ),
    /没有可迁移/,
  );
  assert.equal(saves, 0);
});
