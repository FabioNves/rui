import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(3),
});

export async function POST(req: Request) {
  try {
    const { code } = bodySchema.parse(await req.json());
    const clientId = process.env.MENDELEY_CLIENT_ID;
    const clientSecret = process.env.MENDELEY_CLIENT_SECRET;
    const redirectUri =
      process.env.MENDELEY_REDIRECT_URI ?? "http://localhost:8080/callback";

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Missing MENDELEY_CLIENT_ID or MENDELEY_CLIENT_SECRET" },
        { status: 400 },
      );
    }

    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("redirect_uri", redirectUri);

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const resp = await fetch("https://api.mendeley.com/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
    });

    const text = await resp.text();
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Token exchange failed (${resp.status})`, details: text },
        { status: 400 },
      );
    }

    return NextResponse.json(JSON.parse(text));
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
