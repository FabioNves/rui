import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  accessToken: z.string().min(10),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  sort: z.enum(["created", "last_modified", "title"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  folderId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());

    // Build URL for user's library documents
    const url = new URL("https://api.mendeley.com/documents");
    url.searchParams.set("limit", String(body.limit ?? 50));
    if (body.offset) url.searchParams.set("offset", String(body.offset));
    url.searchParams.set("sort", body.sort ?? "last_modified");
    url.searchParams.set("order", body.order ?? "desc");
    url.searchParams.set("view", "all"); // Include abstract and other details
    if (body.folderId) url.searchParams.set("folder_id", body.folderId);

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${body.accessToken}`,
        Accept: "application/vnd.mendeley-document.1+json",
      },
      cache: "no-store",
    });

    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Mendeley request failed (${resp.status})`, details: text },
        { status: 400 },
      );
    }

    const docs: unknown = JSON.parse(text);
    const normalized = Array.isArray(docs)
      ? docs.map((doc) => {
          const d = (doc ?? {}) as { [k: string]: unknown };
          const identifiers = (d.identifiers ?? {}) as { [k: string]: unknown };
          const authorsRaw = d.authors;
          const authors = Array.isArray(authorsRaw)
            ? (authorsRaw as unknown[])
                .map((a) => {
                  if (!a || typeof a !== "object") return "";
                  const first = (a as { first_name?: unknown }).first_name;
                  const last = (a as { last_name?: unknown }).last_name;
                  return [first, last]
                    .filter((x) => typeof x === "string")
                    .join(" ");
                })
                .filter(Boolean)
            : [];
          return {
            id: typeof d.id === "string" ? d.id : undefined,
            title: typeof d.title === "string" ? d.title : undefined,
            authors,
            year: typeof d.year === "number" ? d.year : undefined,
            doi:
              typeof identifiers.doi === "string" ? identifiers.doi : undefined,
            abstract: typeof d.abstract === "string" ? d.abstract : undefined,
            source: typeof d.source === "string" ? d.source : undefined,
            type: typeof d.type === "string" ? d.type : undefined,
            created: typeof d.created === "string" ? d.created : undefined,
            lastModified:
              typeof d.last_modified === "string" ? d.last_modified : undefined,
            fileAttached:
              typeof d.file_attached === "boolean" ? d.file_attached : false,
          };
        })
      : [];

    // Parse pagination from Link header
    const linkHeader = resp.headers.get("Link");
    let hasMore = false;
    if (linkHeader && linkHeader.includes('rel="next"')) {
      hasMore = true;
    }

    // Get total count from Mendeley-Count header if available
    const totalCount = resp.headers.get("Mendeley-Count");

    return NextResponse.json({
      results: normalized,
      hasMore,
      totalCount: totalCount ? parseInt(totalCount, 10) : undefined,
    });
  } catch (err: unknown) {
    const msg =
      err && typeof err === "object" && "message" in err
        ? (err as { message?: unknown }).message
        : "Unknown error";
    return NextResponse.json({ error: String(msg) }, { status: 400 });
  }
}
