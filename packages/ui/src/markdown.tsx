import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "./cn";

/**
 * MarkdownView — renders user-authored markdown in a constrained set of
 * elements, styled to match the rest of the UI.
 *
 * Supports GitHub-flavored markdown: tables, task lists, strikethrough,
 * autolinks. No raw HTML — safe to render untrusted strings (admins should
 * still be careful, but XSS isn't possible through ReactMarkdown's default
 * pipeline).
 *
 * Tone is intentionally compact: incident updates and status messages are
 * usually short paragraphs with the occasional list or link, not blog posts.
 */
export function MarkdownView({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-openmonitor text-foreground text-sm", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node: _node, ...props }) => (
            <p className="mb-2 leading-relaxed last:mb-0" {...props} />
          ),
          a: ({ node: _node, ...props }) => (
            <a
              className="text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          ul: ({ node: _node, ...props }) => <ul className="mb-2 list-disc pl-5" {...props} />,
          ol: ({ node: _node, ...props }) => <ol className="mb-2 list-decimal pl-5" {...props} />,
          li: ({ node: _node, ...props }) => <li className="mb-0.5" {...props} />,
          code: ({ node: _node, className: cls, children, ...props }) => {
            const isInline = !cls?.includes("language-");
            return isInline ? (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props}>
                {children}
              </code>
            ) : (
              <code className={cls} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ node: _node, ...props }) => (
            <pre
              className="my-2 overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs"
              {...props}
            />
          ),
          h1: ({ node: _node, ...props }) => (
            <h1 className="mt-3 mb-1 font-semibold text-base" {...props} />
          ),
          h2: ({ node: _node, ...props }) => (
            <h2 className="mt-3 mb-1 font-semibold text-base" {...props} />
          ),
          h3: ({ node: _node, ...props }) => (
            <h3 className="mt-3 mb-1 font-semibold text-sm" {...props} />
          ),
          blockquote: ({ node: _node, ...props }) => (
            <blockquote
              className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
              {...props}
            />
          ),
          table: ({ node: _node, ...props }) => (
            <div className="my-2 overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs" {...props} />
            </div>
          ),
          th: ({ node: _node, ...props }) => (
            <th
              className="border-b border-border bg-muted/30 px-3 py-2 text-left font-medium"
              {...props}
            />
          ),
          td: ({ node: _node, ...props }) => (
            <td className="border-b border-border px-3 py-2" {...props} />
          ),
          hr: ({ node: _node, ...props }) => <hr className="my-3 border-border" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
