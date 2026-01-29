import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  doi: z.string().min(3),
});

function firstYearFromDateParts(source: unknown): number | undefined {
  if (!source || typeof source !== "object") return undefined;
  const dateParts = (source as { [k: string]: unknown })["date-parts"];
  if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0]))
    return undefined;
  const year = (dateParts[0] as unknown[])[0];
  return typeof year === "number" ? year : undefined;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "Invalid request";
}

export async function POST(req: Request) {
  try {
    const { doi } = bodySchema.parse(await req.json());
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "RUI (local)",
      },
      cache: "no-store",
    });
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Crossref lookup failed (${resp.status})` },
        { status: 400 },
      );
    }
    const data: unknown = await resp.json();
    const message =
      data && typeof data === "object" && "message" in data
        ? (data as { message?: unknown }).message
        : undefined;

    const m = (message ?? {}) as {
      title?: unknown;
      author?: unknown;
      year?: unknown;
      issued?: unknown;
      published?: unknown;
    };

    const title =
      Array.isArray(m.title) && typeof m.title[0] === "string"
        ? m.title[0]
        : undefined;
    const authors = Array.isArray(m.author)
      ? (m.author as unknown[])
          .map((a) => {
            if (!a || typeof a !== "object") return "";
            const given = (a as { given?: unknown }).given;
            const family = (a as { family?: unknown }).family;
            return [given, family]
              .filter((x) => typeof x === "string")
              .join(" ")
              .trim();
          })
          .filter(Boolean)
      : [];

    const year =
      firstYearFromDateParts(m.issued) ?? firstYearFromDateParts(m.published);

    return NextResponse.json({
      title,
      authors,
      year,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 400 });
  }
}
