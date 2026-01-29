import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  state: z.string().min(8),
  scope: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const { state, scope } = bodySchema.parse(await req.json());
    const clientId = process.env.MENDELEY_CLIENT_ID;
    const redirectUri =
      process.env.MENDELEY_REDIRECT_URI ?? "http://localhost:8080/callback";
    if (!clientId) {
      return NextResponse.json(
        { error: "Missing MENDELEY_CLIENT_ID" },
        { status: 400 },
      );
    }

    const url = new URL("https://api.mendeley.com/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scope ?? "all");
    url.searchParams.set("state", state);

    return NextResponse.json({ url: url.toString() });
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
