import test from "node:test";
import assert from "node:assert/strict";
import {
  validateZoomPercent,
  readZoomPercent,
  stepZoomPercent,
  zoomCommandForKey,
  initialWindowBounds,
  createDisplayController,
} from "./display.mjs";

test("缩放只接受四档数值，损坏或旧版偏好回到默认", () => {
  for (const value of [100, 110, 125, 150]) {
    assert.equal(validateZoomPercent(value), value);
    assert.equal(readZoomPercent(value), value);
  }
  for (const value of [undefined, null, "125", 0, 99, 200, NaN, Infinity, {}, []]) {
    assert.throws(() => validateZoomPercent(value), /100/);
    assert.equal(readZoomPercent(value), 100);
  }
});

test("快捷键在支持档位间步进，到边界停止，重置回100", () => {
  assert.equal(stepZoomPercent(100, "in"), 110);
  assert.equal(stepZoomPercent(110, "in"), 125);
  assert.equal(stepZoomPercent(125, "in"), 150);
  assert.equal(stepZoomPercent(150, "in"), 150);
  assert.equal(stepZoomPercent(125, "out"), 110);
  assert.equal(stepZoomPercent(100, "out"), 100);
  assert.equal(stepZoomPercent(150, "reset"), 100);
});

test("普通键和Alt组合不触发缩放，Ctrl/Cmd的加减与0可恢复界面", () => {
  assert.equal(zoomCommandForKey({ key: "+", control: true }), "in");
  assert.equal(zoomCommandForKey({ key: "=", meta: true }), "in");
  assert.equal(zoomCommandForKey({ key: "-", control: true }), "out");
  assert.equal(zoomCommandForKey({ key: "0", meta: true }), "reset");
  assert.equal(zoomCommandForKey({ key: "+" }), null);
  assert.equal(zoomCommandForKey({ key: "0", control: true, alt: true }), null);
  assert.equal(zoomCommandForKey({ key: "a", control: true }), null);
});

test("窗口包含最小尺寸都在高DPI小工作区内，支持负坐标副屏", () => {
  for (const area of [
    { x: 0, y: 0, width: 1920, height: 1040 },
    { x: 0, y: 0, width: 853, height: 440 },
    { x: -1280, y: -200, width: 1280, height: 680 },
    { x: 1280, y: 40, width: 640, height: 360 },
  ]) {
    const bounds = initialWindowBounds(area);
    assert.ok(bounds.width <= area.width && bounds.height <= area.height);
    assert.ok(bounds.minWidth <= bounds.width && bounds.minHeight <= bounds.height);
    assert.ok(bounds.x >= area.x && bounds.y >= area.y);
    assert.ok(bounds.x + bounds.width <= area.x + area.width);
    assert.ok(bounds.y + bounds.height <= area.y + area.height);
  }
});

test("小工作区保留边缘余量，避免原生窗口在分数DPI取整后越界", () => {
  const bounds = initialWindowBounds({ x: -853, y: 20, width: 853, height: 440 });
  assert.ok(bounds.width <= 853 - 16);
  assert.ok(bounds.height <= 440 - 16);
  assert.ok(bounds.x >= -853 + 8);
  assert.ok(bounds.y >= 28);
});

function setup(initial = 100) {
  let saved = initial;
  const persisted = [];
  const rendered = [];
  const events = [];
  const controller = createDisplayController({
    read: () => saved,
    save: async (value) => {
      persisted.push(value);
      saved = value;
    },
    apply: (value) => rendered.push(value),
    publish: (value) => events.push(value),
  });
  return { controller, persisted, rendered, events, saved: () => saved };
}

test("保存成功后才应用并通知界面，重启恢复同一档位", async () => {
  const state = setup();
  assert.deepEqual(await state.controller.set(125), { zoomPercent: 125 });
  assert.deepEqual(state.persisted, [125]);
  assert.deepEqual(state.rendered, [125]);
  assert.deepEqual(state.events, [{ zoomPercent: 125 }]);
  assert.deepEqual(setup(state.saved()).controller.get(), { zoomPercent: 125 });
});

test("连续快捷键不会用旧值覆盖，恢复默认同样持久化", async () => {
  const state = setup();
  await Promise.all([state.controller.step("in"), state.controller.step("in")]);
  assert.equal(state.saved(), 125);
  await state.controller.step("reset");
  assert.equal(state.saved(), 100);
  assert.deepEqual(state.persisted, [110, 125, 100]);
});

test("不合法IPC参数被拒绝且不写入、不应用，后续合法请求仍可执行", async () => {
  const state = setup();
  await assert.rejects(state.controller.set("150"), /100/);
  assert.deepEqual(state.persisted, []);
  assert.deepEqual(state.rendered, []);
  await state.controller.set(150);
  assert.equal(state.saved(), 150);
});

test("磁盘写入失败保留之前大小，队列恢复后仍能设置", async () => {
  let fail = true;
  let saved = 110;
  const applied = [];
  const controller = createDisplayController({
    read: () => saved,
    save: async (value) => {
      if (fail) throw new Error("disk full");
      saved = value;
    },
    apply: (value) => applied.push(value),
    publish: () => {},
  });
  await assert.rejects(controller.set(150), /disk full/);
  assert.equal(saved, 110);
  assert.deepEqual(applied, []);
  fail = false;
  await controller.set(125);
  assert.deepEqual(applied, [125]);
});
