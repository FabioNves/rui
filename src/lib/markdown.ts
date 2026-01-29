"use client";

export async function renderMarkdownToSafeHtml(
  markdown: string,
): Promise<string> {
  if (typeof window === "undefined") return "";

  const [{ marked }, { default: createDOMPurify }] = await Promise.all([
    import("marked"),
    import("dompurify"),
  ]);

  const DOMPurify = createDOMPurify(window);
  const html = marked.parse(markdown, { gfm: true, breaks: true }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
