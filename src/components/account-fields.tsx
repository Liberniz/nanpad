import { Eye, EyeOff, KeyRound, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Field, Input, Textarea } from "./ui/input";
import { accountId, desktop, type AccountCredential } from "@/lib/desktop";
import type { AssetKind } from "@/lib/types";
import { useVault } from "@/lib/vault-state";
import { t } from "@/lib/i18n";

/** Form keys that belong to the vault, never to the asset record. */
export const ACCOUNT_KEYS = ["_url", "_username", "_note"] as const;

/** Written by the OAuth flow, read back on save. */
export const OAUTH_KEYS = [
  "_oauthProvider",
  "_oauthRefresh",
  "_oauthExpires",
  "_oauthScope",
] as const;

/** The wording changes per kind, but the fields do not. No passwords are kept
 *  for account records — only the account identity; passwords live in your
 *  password manager. The `secret` kind is the exception: its "password" field
 *  holds the secret value itself (API key, SSH private key, token). */
export const ACCOUNT_COPY: Record<AssetKind, { title: string; password?: string; hint: string }> = {
  server: {
    title: "面板 / 控制台账号",
    hint: "云厂商控制台或管理面板的登录账号，与上面的 SSH 凭据分开保存。密码请用密码管理器（如 Bitwarden）保管。",
  },
  domain: {
    title: "注册商账号",
    hint: "注册商后台的登录账号，续费时不用再翻找。密码请用密码管理器保管。",
  },
  mail: {
    title: "邮箱账号",
    hint: "邮箱的登录账号。IMAP/SMTP 授权码如需记录可写在备注里，登录密码请用密码管理器保管。",
  },
  ai: {
    title: "服务商账号",
    hint: "订阅账号等身份信息。API Key 与恢复码可放备注，密码请用密码管理器保管。",
  },
  secret: {
    title: "密钥内容",
    password: "完整值",
    hint: "完整值只存在加密库中，资产文件里只留提示片段。",
  },
  cert: { title: "签发平台账号", hint: "签发或托管平台的登录账号。密码请用密码管理器保管。" },
  service: {
    title: "服务账号",
    hint: "服务的管理账号（如 Cloudflare / Vercel 后台）。密码请用密码管理器保管。",
  },
};

export const WEBSITE_ACCOUNT_COPY = {
  title: "网站登录账号",
  hint: "只记录登录地址和账号，不保存密码 —— 密码请用 Bitwarden 等密码管理器保管。可在资产详情关联注册邮箱。",
};

export function accountFromForm(
  form: Record<string, string>,
  keepsSecretValue = false,
): AccountCredential | null {
  const url = form._url?.trim();
  const username = form._username?.trim();
  // Passwords are never recorded for account entries; only `secret` assets
  // (API key / SSH key / token) keep their secret value in this field.
  const password = keepsSecretValue ? (form._password ?? "") : "";
  const note = form._note?.trim();
  const oauthProvider = form._oauthProvider?.trim();
  if (!url && !username && !password && !note && !oauthProvider) return null;
  return {
    url: url || undefined,
    username: username || undefined,
    password: password || undefined,
    note: note || undefined,
    ...(oauthProvider
      ? {
          oauth: {
            provider: oauthProvider,
            refreshToken: form._oauthRefresh || null,
            expiresAt: form._oauthExpires || null,
            scope: form._oauthScope ?? "",
          },
        }
      : {}),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Account fields inside the composer.
 *
 * Nothing here reaches the asset record: on save the composer writes this to
 * the vault under `account:<id>`. When the vault is open the existing values
 * are read back so editing is editing rather than retyping.
 */
export function AccountFields({
  assetId,
  kind,
  form,
  set,
}: {
  assetId: string | null;
  kind: AssetKind;
  form: Record<string, string>;
  set: (key: string, value: string) => void;
}) {
  const bridge = desktop();
  const unlocked = useVault((s) => s.unlocked);
  const requireVault = useVault((s) => s.require);
  const [reveal, setReveal] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [stored, setStored] = useState(false);
  const website = kind === "secret" && form.kind === "password";
  const copy = website ? WEBSITE_ACCOUNT_COPY : ACCOUNT_COPY[kind];
  // Only `secret` assets (API key / SSH private key / token, not website
  // accounts) keep a secret value; every other kind records the account only.
  const keepsSecretValue = kind === "secret" && !website;
  const secretLabel = keepsSecretValue ? (ACCOUNT_COPY.secret.password ?? "") : "";

  // Prefill once per open, and only from an unlocked vault.
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!bridge || !assetId || !unlocked || loaded) return;
      try {
        const rec = await bridge.vault.get(accountId(assetId));
        if (!alive) return;
        setLoaded(true);
        if (!rec) return;
        setStored(true);
        // 只有表单里从未出现过的键才回填：用户抢先输入的值不能被迟到的
        // 密钥库记录覆盖（异步预填与手输竞争时以手输为准）。
        if (rec.url && !("_url" in form)) set("_url", rec.url);
        if (rec.username && !("_username" in form)) set("_username", rec.username);
        if (keepsSecretValue && rec.password && !("_password" in form)) set("_password", rec.password);
        if (rec.note && !("_note" in form)) set("_note", rec.note);
      } catch {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
    // `set` is a fresh closure every render; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, assetId, unlocked, loaded]);

  if (!bridge) return null;

  return (
    <div className="sm:col-span-2">
      <div className="rounded-xl bg-canvas p-4">
        <div className="mb-3 flex items-center gap-2">
          <UserRound className="size-4 text-muted" />
          <h3 className="text-meta font-semibold">{t(copy.title)}</h3>
          <span className="ml-auto text-2xs text-subtle">
            {!unlocked
              ? t("密钥库已锁定")
              : assetId && !loaded
                ? t("读取中…")
                : stored
                  ? t("已保存")
                  : t("尚未保存")}
          </span>
        </div>

        {!unlocked ? (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void requireVault(t("查看或保存账号信息需要先解锁密钥库。"))}
            >
              <KeyRound className="size-3.5" />

              {t("解锁密钥库")}
            </Button>
            <span className="text-2xs text-muted">
              {t("解锁后可读取已保存的账号，或录入新的。")}
            </span>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2" aria-busy={Boolean(assetId) && !loaded}>
            {/* 编辑已存在资产时，密钥库记录异步读取期间字段短暂为空；
                禁用并提示，避免被误读成“密码没保存”。 */}
            <fieldset
              disabled={Boolean(assetId) && !loaded}
              className="contents"
              aria-label={t("账号信息")}
            >
            {(kind !== "secret" || website) && (
              <>
                <Field label={t("登录地址")}>
                  <Input
                    name="account-url"
                    aria-label={t("登录地址")}
                    value={form._url ?? ""}
                    placeholder="https://…"
                    autoComplete="off"
                    onChange={(e) => set("_url", e.target.value)}
                  />
                </Field>
                <Field label={t("账号")}>
                  <Input
                    name="account-username"
                    aria-label={t("账号")}
                    value={form._username ?? ""}
                    autoComplete="off"
                    onChange={(e) => set("_username", e.target.value)}
                  />
                </Field>
              </>
            )}

            {keepsSecretValue && (
              <div className="sm:col-span-2">
                <Field label={t(secretLabel)}>
                  <div className="relative">
                    <Input
                      type={reveal ? "text" : "password"}
                      name="account-password"
                      aria-label={t(secretLabel)}
                      value={form._password ?? ""}
                      autoComplete="off"
                      spellCheck={false}
                      className="pr-10 font-mono"
                      onChange={(e) => set("_password", e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={reveal ? t("隐藏") : t("显示")}
                      className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-subtle transition-colors duration-150 ease-out hover:bg-line hover:text-ink"
                      onClick={() => setReveal((v) => !v)}
                    >
                      {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
              </div>
            )}

            <div className="sm:col-span-2">
              <Field label={t("备注（恢复码 / 授权码 / 二次验证）")}>
                <Textarea
                  name="account-note"
                  value={form._note ?? ""}
                  spellCheck={false}
                  className="min-h-20 font-mono text-2xs"
                  onChange={(e) => set("_note", e.target.value)}
                />
              </Field>
            </div>

            {stored && assetId && (
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-crit"
                  onClick={async () => {
                    await bridge.vault.remove(accountId(assetId));
                    setStored(false);
                    for (const key of [...ACCOUNT_KEYS, "_password"] as const) set(key, "");
                    toast(t("已删除保存的账号信息"));
                  }}
                >
                  <Trash2 className="size-3.5" />

                  {t("删除已保存的账号")}
                </Button>
              </div>
            )}
            </fieldset>
          </div>
        )}

        <p className="mt-3 text-2xs leading-relaxed text-subtle">{t(copy.hint)}</p>
      </div>
    </div>
  );
}
