import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhoneNumber, normalizePhoneNumbers, phoneExpiry } from "./phone-numbers.mjs";
import { notificationCandidates, NotificationTracker } from "./notifications.mjs";
const number = {
  id: "phone-1",
  number: "+44 07000 000001",
  label: "订阅号码",
  provider: "QA",
  expiresAt: "2026-10-02",
  notes: "保留前导零",
  subscriptionIds: ["ai-1", "ai-1"],
  createdAt: "2026-09-30T01:00:00Z",
  updatedAt: "2026-09-30T01:00:00Z",
};
test("号码保留加号和前导零，绑定去重，不带未知凭据字段", () => {
  const row = normalizePhoneNumber({ ...number, password: "private" });
  assert.equal(row.number, number.number);
  assert.deepEqual(row.subscriptionIds, ["ai-1"]);
  assert.equal("password" in row, false);
  assert.equal(
    normalizePhoneNumber({ ...number, number: "0012345678", subscriptionIds: [] }).number,
    "0012345678",
  );
});
test("拒绝不合法日期和过长或非号码输入，空到期可保存", () => {
  for (const expiresAt of ["2026-02-30", "2026-13-01", "not-date"])
    assert.throws(() => normalizePhoneNumber({ ...number, expiresAt }));
  for (const input of ["", "abc", "123".repeat(30), {}, 123456])
    assert.throws(() => normalizePhoneNumber({ ...number, number: input }));
  assert.equal(normalizePhoneNumber({ ...number, expiresAt: "" }).expiresAt, "");
});
test("旧快照默认空集合，严格导入阻止丢失数据，宽松恢复保留合法项", () => {
  assert.deepEqual(normalizePhoneNumbers(undefined), []);
  assert.throws(() => normalizePhoneNumbers([number, { id: "bad" }]));
  assert.deepEqual(normalizePhoneNumbers([number, { id: "bad" }], false), [
    normalizePhoneNumber(number),
  ]);
  assert.throws(() => normalizePhoneNumbers([number, number]));
});
test("到期按本地日历区分今天/过期/30天/未知，不受当天时刻影响", () => {
  const now = new Date(2026, 8, 30, 23, 59);
  assert.deepEqual(phoneExpiry("2026-09-30", now), { status: "today", days: 0 });
  assert.deepEqual(phoneExpiry("2026-09-29", now), { status: "expired", days: -1 });
  assert.deepEqual(phoneExpiry("2026-10-30", now), { status: "soon", days: 30 });
  assert.deepEqual(phoneExpiry("2026-10-31", now), { status: "active", days: 31 });
  assert.deepEqual(phoneExpiry("", now), { status: "unknown", days: null });
});
test("号码提醒包含正确入口，按日去重，续期后恢复提醒周期", () => {
  const now = new Date(2026, 8, 30, 12).getTime();
  const candidates = notificationCandidates({ phoneNumbers: [number] }, now);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, "phone");
  assert.equal(candidates[0].id, "phone-1");
  assert.equal(candidates[0].days, 2);
  assert.doesNotMatch(candidates[0].name, /07000/);
  const tracker = new NotificationTracker();
  assert.equal(tracker.take(candidates, now).length, 1);
  assert.equal(tracker.take(candidates, now + 60000).length, 0);
  assert.deepEqual(
    notificationCandidates({ phoneNumbers: [{ ...number, expiresAt: "2027-01-01" }] }, now),
    [],
  );
});
