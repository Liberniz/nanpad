import assert from "node:assert/strict";
import test from "node:test";
import { saveAndVerifyUsageSource } from "../src/lib/usage-connect.mjs";

test("保存来源后验证一次，使用后端返回的来源 ID", async () => {
  const calls = [];
  const input = { name: "我的面板", type: "3x-ui" };
  const api = {
    async add(value) {
      calls.push(["add", value]);
      return { id: "usage-created", name: value.name };
    },
    async refresh(id) {
      calls.push(["refresh", id]);
      return { sources: [], records: [] };
    },
  };
  const result = await saveAndVerifyUsageSource(api, input);
  assert.deepEqual(calls, [
    ["add", input],
    ["refresh", "usage-created"],
  ]);
  assert.equal(result.verified, true);
});

test("验证失败保留已保存来源，后续重试不需要重复录入", async () => {
  const sources = [];
  const api = {
    async add(value) {
      const source = { id: "usage-kept", name: value.name };
      sources.push(source);
      return source;
    },
    async refresh() {
      throw new Error("3x-ui HTTP 403：面板凭据无效");
    },
  };
  const result = await saveAndVerifyUsageSource(api, { name: "面板" });
  assert.equal(result.verified, false);
  assert.equal(result.source.id, "usage-kept");
  assert.match(result.error, /3x-ui HTTP 403/);
  assert.equal(sources.length, 1);
});

test("保存失败不发起采集，也不宣称来源已保存", async () => {
  let refreshed = false;
  const api = {
    async add() {
      throw new Error("密钥库已锁定");
    },
    async refresh() {
      refreshed = true;
    },
  };
  await assert.rejects(saveAndVerifyUsageSource(api, {}), /密钥库已锁定/);
  assert.equal(refreshed, false);
});
