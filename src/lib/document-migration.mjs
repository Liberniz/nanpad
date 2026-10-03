/** 文档正文即标准 Markdown 源码，不再经富文本 JSON 中转。
 * @param {{ id: string, name: string, docs?: string }} server
 * @param {Pick<import("./documents").DocumentsBridge, "save">} store
 * @returns {Promise<import("./documents").DocumentAsset>}
 */
export async function migrateServerDocument(server, store) {
  if (!server.docs?.trim()) throw new Error("没有可迁移的旧文档");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(server.id));
  const id =
    "doc-legacy-server-" +
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const now = new Date().toISOString();
  return store.save({
    id,
    title: server.name + " · Markdown",
    content: server.docs,
    bindings: [{ kind: "server", id: server.id }],
    createdAt: now,
    updatedAt: now,
    createOnly: true,
  });
}
