import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";

const directory = await mkdtemp(resolve("release/display-qa-"));
const env = { ...process.env, NANPAD_TEST_DATA_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
delete env.SINAN_DEV_URL;
let app;
async function launch() {
  app = await electron.launch({ args: [resolve("electron/main.mjs")], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.sinan?.display));
  assert.equal(await app.evaluate(({ app }) => app.getPath("userData")), directory);
  return page;
}
async function actualZoom() {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
  );
}
async function pressNative(keyCode) {
  await app.evaluate(({ BrowserWindow }, key) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.sendInputEvent({ type: "keyDown", keyCode: key, modifiers: ["control"] });
    contents.sendInputEvent({ type: "keyUp", keyCode: key, modifiers: ["control"] });
  }, keyCode);
}
async function waitZoom(value) {
  for (let i = 0; i < 100; i++) {
    if (Math.abs((await actualZoom()) - value / 100) < 0.001) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  console.log(
    await app.evaluate(({ BrowserWindow }) => ({
      inputs: globalThis.displayTestInputs,
      windows: BrowserWindow.getAllWindows().map((w) => ({
        focused: w.isFocused(),
        visible: w.isVisible(),
      })),
    })),
  );
  assert.fail(`Zoom did not become ${value}`);
}
try {
  let page = await launch();
  assert.deepEqual(await page.evaluate(() => window.sinan.display.get()), { zoomPercent: 100 });
  const bounds = await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return {
      bounds: window.getBounds(),
      minimum: window.getMinimumSize(),
      area: screen.getDisplayMatching(window.getBounds()).workArea,
    };
  });
  assert.ok(bounds.bounds.width <= bounds.area.width && bounds.bounds.height <= bounds.area.height);
  assert.ok(bounds.minimum[0] <= bounds.area.width && bounds.minimum[1] <= bounds.area.height);
  for (const zoomPercent of [100, 110, 125, 150]) {
    assert.deepEqual(await page.evaluate((value) => window.sinan.display.set(value), zoomPercent), {
      zoomPercent,
    });
    await waitZoom(zoomPercent);
  }
  const invalid = await page.evaluate(async () => {
    const values = ["125", null, 0, 99, 151, NaN, Infinity, {}, []];
    const rejected = [];
    for (const value of values) {
      try {
        await window.sinan.display.set(value);
        rejected.push(false);
      } catch {
        rejected.push(true);
      }
    }
    return rejected;
  });
  assert.ok(invalid.every(Boolean));
  assert.deepEqual(await page.evaluate(() => window.sinan.display.get()), { zoomPercent: 150 });
  // 独立 WebContents 即使直接调用同一 IPC，也不能控制主窗口缩放。
  const foreign = await app.evaluate(async ({ BrowserWindow }) => {
    const test = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    try {
      await test.loadURL("data:text/html,display-ipc-check");
      return await test.webContents.executeJavaScript(
        "require('electron').ipcRenderer.invoke('display:set', 100)",
      );
    } finally {
      test.destroy();
    }
  });
  assert.equal(foreign.ok, false);
  await app.evaluate(({ BrowserWindow }) => {
    globalThis.displayTestInputs = [];
    const window = BrowserWindow.getAllWindows()[0];
    window.webContents.on("before-input-event", (_event, input) =>
      globalThis.displayTestInputs.push(input),
    );
    window.show();
    window.focus();
  });
  await pressNative("0");
  await waitZoom(100);
  await pressNative("=");
  await waitZoom(110);
  await pressNative("-");
  await waitZoom(100);
  await Promise.all([
    page.evaluate(() => window.sinan.display.set(125)),
    page.evaluate(() => window.sinan.preferences.set({ notifications: false })),
  ]);
  const persisted = JSON.parse(await readFile(join(directory, "preferences.json"), "utf8"));
  assert.equal(persisted.zoomPercent, 125);
  assert.equal(persisted.notifications, false);
  await app.close();
  app = null;
  page = await launch();
  assert.deepEqual(await page.evaluate(() => window.sinan.display.get()), { zoomPercent: 125 });
  await waitZoom(125);
  await page.evaluate(() => window.sinan.display.set(100));
  await waitZoom(100);
  console.log(
    JSON.stringify(
      {
        ok: true,
        scope: "current-main-and-preload-only",
        zooms: [100, 110, 125, 150],
        rejected: invalid.length,
        foreignSenderRejected: true,
        restartPersisted: true,
        bounds,
      },
      null,
      2,
    ),
  );
} finally {
  await app?.close();
}
