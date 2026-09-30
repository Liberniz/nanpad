import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: "zh-CN",
  viewport: { width: 1280, height: 850 },
});
const expected = {
  id: "qa-export-phone",
  number: "+1 555 200 3000",
  label: "导出验收",
  provider: "Example",
  expiresAt: "2027-01-01",
  notes: "保留备注",
  subscriptionIds: ["qa-ai-a", "qa-ai-b"],
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};
const accounts = ["a", "b"].map((id) => ({
  id: `qa-ai-${id}`,
  name: `验收账号 ${id}`,
  provider: "Test",
  plan: "Test",
  accountEmail: `${id}@example.test`,
  keyHint: "",
  monthlyUsd: 0,
  monthlyUsdKnown: false,
  usagePct: 0,
  renewsAt: "",
  status: "online",
  notes: "",
  tags: [],
}));
await context.addInitScript(
  ({ phone, aiAssets }) => {
    if (localStorage.getItem("phone-export-seeded")) return;
    localStorage.setItem(
      "sinan-assets-v1",
      JSON.stringify({
        version: 0,
        state: {
          servers: [],
          domains: [],
          mailboxes: [],
          aiAssets,
          secrets: [],
          certs: [],
          links: [],
          phoneNumbers: [phone],
        },
      }),
    );
    localStorage.setItem(
      "sinan-settings-v1",
      JSON.stringify({ version: 0, state: { language: "zh", theme: "light" } }),
    );
    localStorage.setItem("phone-export-seeded", "true");
  },
  { phone: expected, aiAssets: accounts },
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("sinan-assets-v1")).state);
const dialog = page.getByRole("dialog", { name: "设置", exact: true });
async function openData() {
  await page.keyboard.press("Control+,");
  await dialog.getByRole("button", { name: "数据", exact: true }).click();
}
async function importJson(snapshot) {
  const chooserPromise = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "导入", exact: true }).click();
  await (
    await chooserPromise
  ).setFiles({
    name: "sinan-assets.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(snapshot)),
  });
  await page.waitForFunction(
    (count) =>
      JSON.parse(localStorage.getItem("sinan-assets-v1")).state.phoneNumbers.length === count,
    snapshot.phoneNumbers.length,
  );
}
try {
  await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-app-ready="true"]').waitFor({ timeout: 60000 });
  await openData();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出", exact: true }).click();
  const download = await downloadPromise;
  const snapshot = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.deepEqual(snapshot.phoneNumbers, [expected], "设置导出文件必须包含号码所有字段和两个关联");
  assert.deepEqual(snapshot.aiAssets, accounts);
  await dialog.getByRole("button", { name: "清空", exact: true }).click();
  assert.equal((await stored()).phoneNumbers.length, 0);
  await dialog.waitFor({ state: "hidden" });
  await openData();
  await importJson(snapshot);
  assert.deepEqual((await stored()).phoneNumbers, [expected]);
  assert.deepEqual((await stored()).aiAssets, accounts);

  const records = Array.from({ length: 10000 }, (_, index) => ({
    ...expected,
    id: `qa-limit-${index}`,
  }));
  await importJson({ ...snapshot, phoneNumbers: records });
  const limitCheck = await page.evaluate(async () => {
    // 使用当前界面加载的同一个模块地址，避免 Vite HMR 创建第二份 store。
    const url = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /\/src\/lib\/store\.ts(?:\?|$)/.test(name))
      .at(-1);
    if (!url) throw new Error("Store module URL unavailable");
    const { useAppStore } = await import(url);
    const store = useAppStore.getState();
    const before = store.phoneNumbers;
    if (before.length !== 10000) throw new Error("Store module is not the rendered instance");
    let message = "";
    try {
      store.upsertPhoneNumber({ ...before[0], id: "qa-limit-overflow" });
    } catch (error) {
      message = error.message;
    }
    const unchanged = useAppStore.getState().phoneNumbers === before;
    store.upsertAi({ ...store.aiAssets[0], notes: "容量异常之后仍能保存其他资产" });
    return {
      rejected: /10000/.test(message),
      unchanged,
      retained: useAppStore.getState().phoneNumbers.length,
      otherAssetSaved: useAppStore.getState().aiAssets[0].notes === "容量异常之后仍能保存其他资产",
    };
  });
  assert.deepEqual(limitCheck, {
    rejected: true,
    unchanged: true,
    retained: 10000,
    otherAssetSaved: true,
  });
  assert.equal((await stored()).phoneNumbers.length, 10000);
  assert.equal((await stored()).aiAssets[0].notes, "容量异常之后仍能保存其他资产");
  await importJson(snapshot);
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-app-ready="true"]').waitFor();
  assert.deepEqual((await stored()).phoneNumbers, [expected]);
  assert.deepEqual((await stored()).aiAssets, accounts);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      settingsExportContainsPhonesAndBindings: true,
      importRestoresPhonesAndAccounts: true,
      reloadRetainsData: true,
      storeLimitCheck: limitCheck,
      pageErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
