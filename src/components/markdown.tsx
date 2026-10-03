import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { desktop } from "@/lib/desktop";
import { toast } from "sonner";

export function Markdown({ children, images }: { children: string; images?: "show" }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url, _key, node) => {
          if (/^https?:\/\//i.test(url)) return url;
          // Images may also be data: URIs the store validated on save
          // (png/jpeg/webp, ≤2 MiB, ≤2048 px). Links stay HTTP(S)-only.
          if (node.tagName === "img" && /^data:image\/(png|jpeg|webp);base64,/i.test(url))
            return url;
          return "";
        }}
        components={{
          img: ({ alt, src }) =>
            images === "show" && src ? (
              <img src={src} alt={alt || ""} loading="lazy" referrerPolicy="no-referrer" />
            ) : (
              <span className="text-muted">[{alt || "图片"}]</span>
            ),
          a: ({ href, children: label }) =>
            href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  const bridge = desktop();
                  if (bridge) {
                    event.preventDefault();
                    void bridge
                      .openExternal(href)
                      .catch((error: Error) => toast.error(error.message));
                  }
                }}
              >
                {label}
              </a>
            ) : (
              <span>{label}</span>
            ),
          table: ({ children: rows }) => (
            <div className="markdown-table">
              <table>{rows}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
