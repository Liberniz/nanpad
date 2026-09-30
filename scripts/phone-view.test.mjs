import test from "node:test";
import assert from "node:assert/strict";
import { visiblePhoneNumbers } from "../src/lib/phone-view.mjs";

const now = new Date(2026, 8, 30, 12);
const records = [
  {
    id: "none",
    number: "+1 555 1000",
    label: "长期号码",
    provider: "Local",
    expiresAt: "",
    notes: "",
    subscriptionIds: [],
  },
  {
    id: "later",
    number: "+44 7700 900 123",
    label: "旅行",
    provider: "Virtual",
    expiresAt: "2027-01-01",
    notes: "备用",
    subscriptionIds: ["ai-a"],
  },
  {
    id: "soon",
    number: "+1 555 2000",
    label: "订阅验证",
    provider: "Example",
    expiresAt: "2026-10-05",
    notes: "续费前检查",
    subscriptionIds: ["ai-a", "ai-b"],
  },
  {
    id: "expired",
    number: "+86 138 0000 0000",
    label: "旧号码",
    provider: "Example",
    expiresAt: "2026-09-29",
    notes: "",
    subscriptionIds: [],
  },
];

test("号码默认按到期日排序，未知到期日放最后，原数组不变", () => {
  assert.deepEqual(
    visiblePhoneNumbers(records, "", "all", now).map((r) => r.id),
    ["expired", "soon", "later", "none"],
  );
  assert.equal(records[0].id, "none");
});

test("号码搜索兼容分隔空格，名称、供应商和备注均可查询", () => {
  assert.deepEqual(
    visiblePhoneNumbers(records, "447700900", "all", now).map((r) => r.id),
    ["later"],
  );
  assert.deepEqual(
    visiblePhoneNumbers(records, "续费", "all", now).map((r) => r.id),
    ["soon"],
  );
  assert.deepEqual(
    visiblePhoneNumbers(records, "eXaMpLe", "all", now).map((r) => r.id),
    ["expired", "soon"],
  );
});

test("关注筛选包含已到期和30天内号码，并能单独筛选未知到期日", () => {
  assert.deepEqual(
    visiblePhoneNumbers(records, "", "attention", now).map((r) => r.id),
    ["expired", "soon"],
  );
  assert.deepEqual(
    visiblePhoneNumbers(records, "", "expired", now).map((r) => r.id),
    ["expired"],
  );
  assert.deepEqual(
    visiblePhoneNumbers(records, "", "unknown", now).map((r) => r.id),
    ["none"],
  );
  assert.deepEqual(
    visiblePhoneNumbers(records, "", "active", now).map((r) => r.id),
    ["later"],
  );
});

test("搜索和到期筛选共同生效，清空查询恢复结果", () => {
  assert.deepEqual(visiblePhoneNumbers(records, "旅行", "attention", now), []);
  assert.equal(visiblePhoneNumbers(records, "   ", "all", now).length, records.length);
});
