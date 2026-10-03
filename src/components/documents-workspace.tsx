import { uploadImage, type ImageBedStatus } from "@/lib/image-bed";
import { ImageBedSettings } from "./image-bed-settings";
import { Markdown } from "./markdown";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code2,
  Link2,
  ImagePlus,
  Plus,
  FileText,
  Search,
  Save,
  Download,
  Trash2,
  X,
  Paperclip,
  Eye,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { useDocuments, documentImage, type DocumentAsset } from "@/lib/documents";
import { assetEntries, refKey } from "@/lib/operations";
import { useAppStore } from "@/lib/store";
import { KIND_LABEL } from "@/lib/status";
import { desktop } from "@/lib/desktop";
import { downloadJson } from "@/lib/utils";
import { Button } from "./ui/button";
import { t } from "@/lib/i18n";

const fail = (error: unknown) =>
  toast.error(error instanceof Error ? error.message : String(error));
export function DocumentsWorkspace() {
  const { list, selected, drafts, load, open, create } = useDocuments();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
    return () => {
      const s = useDocuments.getState();
      if (s.selected) void s.flush(s.selected).catch(fail);
    };
  }, [load]);
  const filtered = list.filter(
    (doc) =>
      (filter !== "unbound" || doc.bindings.length === 0) &&
      (doc.title + doc.excerpt).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="documents-workspace">
      <aside className="documents-list">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">
            {t("我的文档")} <span className="text-muted">{list.length}</span>
          </span>
          <Button
            size="icon-sm"
            aria-label={t("新建文档")}
            onClick={() => void create().catch(fail)}
          >
            <Plus />
          </Button>
        </div>
        <label className="documents-search">
          <Search className="size-4" />
          <input
            aria-label={t("搜索文档")}
            placeholder={t("搜索文档")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="flex gap-2 text-sm">
          {[
            ["all", "全部文档"],
            ["unbound", "未关联"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              className={filter === value ? "doc-filter active" : "doc-filter"}
              onClick={() => setFilter(value)}
            >
              {t(label)}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-crit">
            {error}
          </p>
        )}
        <div className="space-y-2">
          {filtered.map((doc) => (
            <button
              type="button"
              key={doc.id}
              className={selected === doc.id ? "document-list-item active" : "document-list-item"}
              onClick={() => void open(doc.id).catch(fail)}
            >
              <span className="flex items-start gap-2">
                <FileText className="mt-0.5 size-4 shrink-0" />
                <strong className="line-clamp-2 text-sm">{doc.title}</strong>
              </span>
              <span className="mt-2 line-clamp-2 text-xs text-muted">
                {doc.excerpt || t("开始记录你的想法")}
              </span>
              <span className="mt-3 flex justify-between text-xs text-muted">
                <span>
                  {doc.bindings.length ? t("关联 {0} 项资产", doc.bindings.length) : t("独立文档")}
                </span>
                <span>
                  {doc.imageCount > 0
                    ? t("{0} 张图片", doc.imageCount)
                    : new Date(doc.updatedAt).toLocaleDateString()}
                </span>
              </span>
            </button>
          ))}
        </div>
        {!filtered.length && (
          <p className="py-6 text-center text-sm text-muted">{t("暂无匹配文档")}</p>
        )}
      </aside>
      {selected && drafts[selected] ? (
        <DocumentEditor key={selected} doc={drafts[selected]} />
      ) : (
        <div className="document-welcome">
          <FileText className="size-10 text-muted" />
          <h2 className="text-2xl font-semibold">{t("把资料留在资产旁边")}</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            {t("部署笔记、项目方案、照片和参考链接，都可以保存成文档。关联资产是可选的。")}
          </p>
          <Button onClick={() => void create().catch(fail)}>
            <Plus />
            {t("创建第一篇文档")}
          </Button>
        </div>
      )}
    </div>
  );
}

function DocumentEditor({ doc }: { doc: DocumentAsset }) {
  const change = useDocuments((s) => s.change);
  const flush = useDocuments((s) => s.flush);
  const status = useDocuments((s) => s.status[doc.id]);
  const error = useDocuments((s) => s.errors[doc.id]);
  const snapshot = useAppStore(
    useShallow((s) => ({
      servers: s.servers,
      domains: s.domains,
      mailboxes: s.mailboxes,
      aiAssets: s.aiAssets,
      secrets: s.secrets,
      certs: s.certs,
      services: s.services,
    })),
  );
  const assets = assetEntries(snapshot);
  const [bindingQuery, setBindingQuery] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imageStatus, setImageStatus] = useState<ImageBedStatus | null>(null);
  const [imageStatusError, setImageStatusError] = useState("");
  const [uploadResult, setUploadResult] = useState("");
  const [retryMigration, setRetryMigration] = useState(false);
  const handleImageStatus = useCallback((next: ImageBedStatus) => {
    setImageStatus(next);
    setImageStatusError("");
  }, []);
  useEffect(() => {
    const api = desktop()?.images;
    if (api)
      void api
        .status()
        .then(handleImageStatus)
        .catch((cause) =>
          setImageStatusError(cause instanceof Error ? cause.message : String(cause)),
        );
  }, [handleImageStatus]);
  const [uploadError, setUploadError] = useState("");
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState("");
  const uploadingRef = useRef(false);
  const update = (patch: Partial<DocumentAsset>) =>
    change({ ...useDocuments.getState().drafts[doc.id], ...patch });
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const currentContent = () => useDocuments.getState().drafts[doc.id]?.content ?? "";
  /** Wrap the selection (or a placeholder) with a Markdown snippet. */
  const insertSnippet = (before: string, after: string, placeholder = "") => {
    const el = textRef.current;
    const value = currentContent();
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || placeholder;
    update({ content: value.slice(0, start) + before + selected + after + value.slice(end) });
    requestAnimationFrame(() => {
      const target = textRef.current;
      if (!target) return;
      target.focus();
      const pos = start + before.length + selected.length + after.length;
      target.setSelectionRange(pos, pos);
    });
  };
  /** Prefix every selected line, e.g. "- ", "> ", "## ". */
  const prefixLines = (prefix: (index: number) => string) => {
    const el = textRef.current;
    const value = currentContent();
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const rawEnd = value.indexOf("\n", end);
    const lineEnd = rawEnd === -1 ? value.length : rawEnd;
    const prefixed = value
      .slice(lineStart, lineEnd)
      .split("\n")
      .map((line, index) => prefix(index) + line)
      .join("\n");
    update({ content: value.slice(0, lineStart) + prefixed + value.slice(lineEnd) });
    requestAnimationFrame(() => textRef.current?.focus());
  };
  const toolbar = [
    { label: "粗体", Icon: Bold, run: () => insertSnippet("**", "**", "粗体") },
    { label: "斜体", Icon: Italic, run: () => insertSnippet("*", "*", "斜体") },
    { label: "标题", Icon: Heading2, run: () => prefixLines(() => "## ") },
    { label: "无序列表", Icon: List, run: () => prefixLines(() => "- ") },
    { label: "有序列表", Icon: ListOrdered, run: () => prefixLines((i) => `${i + 1}. `) },
    { label: "引用", Icon: Quote, run: () => prefixLines(() => "> ") },
    { label: "代码块", Icon: Code2, run: () => insertSnippet("\n```\n", "\n```\n", "代码") },
  ];
  const insertImages = async (files: File[]) => {
    if (uploadingRef.current) return;
    if (files.length > 20) {
      fail(new Error("每次最多上传 20 张图片"));
      return;
    }
    uploadingRef.current = true;
    setUploading(true);
    setUploadError("");
    setUploadResult("");
    setRetryMigration(false);
    setRetryFiles([]);
    let completed = 0;
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      setUploadProgress(t("正在插入图片 {0} / {1}", index + 1, files.length));
      try {
        const src = await documentImage(file);
        insertSnippet(`![${file.name}](${src})\n`, "", "");
        completed++;
        void useDocuments.getState().flush(doc.id).catch(fail);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : String(e));
        setRetryFiles(files.slice(index));
        break;
      }
    }
    if (completed) setUploadResult(t("已插入 {0} 张图片", completed));
    uploadingRef.current = false;
    setUploading(false);
    setUploadProgress("");
  };
  const migrateImages = async () => {
    const api = desktop()?.images;
    if (!api) return;
    if (!(await api.status()).enabled) {
      fail(new Error("请先启用图床上传"));
      return;
    }
    if (uploadingRef.current) return;
    const sources = new Map<string, string>();
    const markdown = useDocuments.getState().drafts[doc.id]?.content ?? "";
    // Skip fenced code blocks and inline code: those are literal text.
    const prose = markdown
      .replace(/```[\s\S]*?(```|$)/g, "")
      .replace(/`[^`\n]*`/g, "");
    for (const match of prose.matchAll(/!\[([^\]\n]*)\]\(\s*(data:image\/[^)\s]+)\s*\)/g)) {
      sources.set(match[2], match[1] || "image");
    }
    if (!sources.size) {
      fail(new Error("当前文档没有内嵌图片"));
      return;
    }
    uploadingRef.current = true;
    setUploading(true);
    setUploadError("");
    setUploadResult("");
    setRetryMigration(false);
    setRetryFiles([]);
    let completed = 0;
    try {
      for (const [source, name] of sources) {
        setUploadProgress(t("正在迁移图片 {0} / {1}", ++completed, sources.size));
        const url = await uploadImage(source, name, "document");
        const latest = useDocuments.getState().drafts[doc.id];
        if (!latest) break;
        change({ ...latest, content: latest.content.split(source).join(url) });
        await useDocuments.getState().flush(doc.id);
      }
    } catch (e) {
      setUploadError(
        (e instanceof Error ? e.message : String(e)) + t("；已迁移的图片已保留，可继续重试。"),
      );
      setRetryMigration(true);
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      setUploadProgress("");
    }
  };
  const choices = assets.filter((a) => a.label.toLowerCase().includes(bindingQuery.toLowerCase()));
  return (
    <div className="document-detail">
      <div className="document-toolbar">
        <div className="flex flex-wrap items-center gap-1">
          {toolbar.map(({ label, Icon, run }) => (
            <button type="button" key={label} title={t(label)} aria-label={t(label)} onClick={run}>
              <Icon className="size-4" />
            </button>
          ))}
          <span className="mx-1 h-5 border-l border-line" />
          <button
            type="button"
            title={t("插入链接")}
            aria-label={t("插入链接")}
            onClick={() => setLink("")}
          >
            <Link2 className="size-4" />
          </button>
          <span className="mx-1 h-5 border-l border-line" />
          <button
            type="button"
            title={t("编辑源码")}
            aria-label={t("编辑源码")}
            aria-pressed={mode === "edit"}
            disabled={mode === "edit"}
            onClick={() => setMode("edit")}
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            title={t("预览效果")}
            aria-label={t("预览效果")}
            aria-pressed={mode === "preview"}
            disabled={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            <Eye className="size-4" />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void insertImages(files);
            e.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" onClick={() => void flush(doc.id).catch(fail)}>
          <Save />
          {t(status === "saved" ? "已保存" : status === "saving" ? "保存中…" : "保存")}
        </Button>
      </div>
      <div className="space-y-3 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus />
            {uploading ? t("正在处理图片…") : t("插入图片")}
          </Button>
          <p className="min-w-0 break-words text-xs text-muted" role="status">
            {!desktop()
              ? t("图片保存在当前浏览器的本地文档")
              : imageStatusError
                ? t("图片保存位置读取失败，可在图片设置中重试。")
                : !imageStatus
                  ? t("正在读取图片保存位置…")
                  : imageStatus.enabled
                    ? t("图片保存到图床：{0}", imageStatus.origin)
                    : t("图片嵌入本机文档")}
          </p>
        </div>
        <p className="text-xs text-muted">
          {t("支持多选、粘贴截图或拖入照片。删除图片只移除文档引用。")}
        </p>
        {(uploading || uploadResult) && (
          <p role="status" className="text-sm text-muted">
            {uploading ? uploadProgress : uploadResult}
          </p>
        )}
        <details>
          <summary className="cursor-pointer text-xs text-muted">
            {t("图片设置与已有图片迁移")}
          </summary>
          <div className="mt-3 space-y-2">
            <ImageBedSettings onStatusChange={handleImageStatus} />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={uploading}
              onClick={() => void migrateImages().catch(fail)}
            >
              {t("将内嵌图片迁移到图床")}
            </Button>
          </div>
        </details>
      </div>
      {uploadError && (
        <div
          role="alert"
          className="m-4 space-y-2 rounded-md border border-crit p-3 text-sm text-crit"
        >
          <p className="break-words">{uploadError}</p>
          {retryFiles.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => void insertImages(retryFiles)}
            >
              {t("重试未完成的图片")}
            </Button>
          )}
          {retryMigration && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => void migrateImages().catch(fail)}
            >
              {t("继续迁移内嵌图片")}
            </Button>
          )}
        </div>
      )}
      {link !== null && (
        <form
          className="document-link-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const url = new URL(link);
              if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
                throw new Error("链接只支持 HTTP 或 HTTPS");
              insertSnippet("[", `](${url.href})`, url.href);
              setLink(null);
            } catch (err) {
              fail(err);
            }
          }}
        >
          <input
            type="url"
            required
            autoFocus
            aria-label={t("链接地址")}
            placeholder="https://…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <Button size="sm" type="submit">
            {t("插入")}
          </Button>
          <button type="button" aria-label={t("取消")} onClick={() => setLink(null)}>
            <X className="size-4" />
          </button>
        </form>
      )}
      {error && (
        <div role="alert" className="m-4 rounded-md border border-crit p-3 text-sm text-crit">
          {t("保存失败，内容仍保留在编辑器中：")}
          {error}
        </div>
      )}
      <div className="document-edit-grid">
        <article className="document-paper">
          <input
            className="document-title"
            aria-label={t("文档标题")}
            placeholder={t("未命名文档")}
            value={doc.title}
            maxLength={160}
            onChange={(e) => update({ title: e.target.value })}
          />
          <div className="mb-8 flex flex-wrap gap-3 text-xs text-muted">
            <span>{t(desktop() ? "自动保存到本机" : "自动保存到当前浏览器")}</span>
            <span>
              {t("更新于")} {new Date(doc.updatedAt).toLocaleString()}
            </span>
          </div>
          {mode === "edit" ? (
            <textarea
              ref={textRef}
              className="document-markdown-input"
              aria-label={t("文档正文（Markdown）")}
              aria-multiline="true"
              placeholder={t("用 Markdown 记录…")}
              value={doc.content}
              onChange={(e) => update({ content: e.target.value })}
              onPasteCapture={(event) => {
                const files = Array.from(event.clipboardData.files).filter((f) =>
                  f.type.startsWith("image/"),
                );
                if (files.length) {
                  event.preventDefault();
                  event.stopPropagation();
                  void insertImages(files);
                }
              }}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes("Files")) event.preventDefault();
              }}
              onDropCapture={(event) => {
                const files = Array.from(event.dataTransfer.files).filter((f) =>
                  f.type.startsWith("image/"),
                );
                if (files.length) {
                  event.preventDefault();
                  event.stopPropagation();
                  void insertImages(files);
                }
              }}
            />
          ) : (
            <div className="document-prose">
              <Markdown images="show">
                {doc.content || t("暂无内容，切换到编辑写点什么。")}
              </Markdown>
            </div>
          )}
        </article>
        <aside className="document-bindings">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Paperclip className="size-4" />
            {t("关联资产")}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {t("可选关联一项或多项资产。取消关联不会删除文档。")}
          </p>
          <input
            className="doc-binding-search"
            aria-label={t("查找关联资产")}
            placeholder={t("搜索资产名称")}
            value={bindingQuery}
            onChange={(e) => setBindingQuery(e.target.value)}
          />
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {choices.map((asset) => (
              <label className="document-binding" key={refKey(asset)}>
                <input
                  type="checkbox"
                  checked={doc.bindings.some((ref) => refKey(ref) === refKey(asset))}
                  onChange={(e) =>
                    update({
                      bindings: e.target.checked
                        ? [...doc.bindings, { kind: asset.kind, id: asset.id }]
                        : doc.bindings.filter((ref) => refKey(ref) !== refKey(asset)),
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{asset.label}</span>
                  <span className="text-xs text-muted">{t(KIND_LABEL[asset.kind])}</span>
                </span>
              </label>
            ))}
            {!choices.length && (
              <p className="py-4 text-xs text-muted">
                {t("没有匹配的资产，可以先保存为独立文档。")}
              </p>
            )}
          </div>
          {doc.bindings
            .filter((ref) => !assets.some((a) => refKey(a) === refKey(ref)))
            .map((ref) => (
              <button
                type="button"
                className="my-2 text-xs text-muted"
                key={refKey(ref)}
                onClick={() =>
                  update({ bindings: doc.bindings.filter((r) => refKey(r) !== refKey(ref)) })
                }
              >
                {t("移除已不存在的关联")} <X className="inline size-3" />
              </button>
            ))}
          <div className="mt-6 grid gap-2 border-t border-line pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadJson(doc.title + ".json", doc)}
            >
              <Download />
              {t("导出文档")}
            </Button>
            <Button
              variant="danger-ghost"
              size="sm"
              onClick={() => {
                if (window.confirm(t("删除这篇文档？关联的资产不会受影响。")))
                  void useDocuments.getState().remove(doc.id).catch(fail);
              }}
            >
              <Trash2 />
              {t("删除文档")}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
