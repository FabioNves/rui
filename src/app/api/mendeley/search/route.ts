import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  accessToken: z.string().min(10),
  query: z.string().optional(),
  doi: z.string().optional(),
  limit: z.number().int().min(1).max(25).optional(),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const url = new URL("https://api.mendeley.com/catalog");
    if (body.doi) url.searchParams.set("doi", body.doi);
    if (body.query) url.searchParams.set("query", body.query);
    url.searchParams.set("limit", String(body.limit ?? 10));

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
                    .join(" ")
                    .trim();
                })
                .filter(Boolean)
            : [];

          return {
            id: typeof d.id === "string" ? d.id : String(d.id ?? ""),
            title: typeof d.title === "string" ? d.title : undefined,
            doi:
              typeof identifiers.doi === "string" ? identifiers.doi : undefined,
            year: typeof d.year === "number" ? d.year : undefined,
            authors,
            type: typeof d.type === "string" ? d.type : undefined,
            source: "mendeley" as const,
          };
        })
      : [];

    return NextResponse.json({ results: normalized });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error:
          err && typeof err === "object" && "message" in err
            ? String((err as { message?: unknown }).message)
            : "Invalid request",
      },
      { status: 400 },
    );
  }
}
