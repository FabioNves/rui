import { NextResponse } from "next/server";
import { z } from "zod";
import { runModel } from "@/lib/ai/providers";
import { providerSchema, structuredAnalysisSchema } from "@/lib/ai/schemas";
import { getErrorMessage, jsonError, requireJsonObject } from "../_shared";

export const runtime = "nodejs";

const bodySchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  titleHint: z.string().optional(),
  doi: z.string().optional(),
  text: z.string().min(200),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());

    const system =
      "You are an expert research analyst writing for an academic audience. Return ONLY valid JSON (no markdown, no code fences).";

    const user = `Analyze the following paper content and extract a structured summary.

Output JSON with this exact shape:
{
  "title": string | undefined,
  "researchQuestion": string,
  "methodology": { "design": string, "data": string, "analysis": string },
  "keyFindings": string[],
  "contributions": string[],
  "limitations": string[],
  "futureWork": string[],
  "keywords": string[],
  "shortSummary": string
}

Writing Style Rules:
- Use professional, formal academic language throughout.
- Do NOT use em dashes (—) or informal punctuation. Use commas, semicolons, or separate sentences instead.
- Write in a clear, objective, scholarly tone.
- If citing any works, use APA 7th edition format.

Content Rules:
- Be precise and faithful to the provided text.
- If something is unclear, say "Not specified".
- Keep lists concise (3-8 items) unless necessary.

Title hint: ${body.titleHint ?? "(none)"}
DOI: ${body.doi ?? "(none)"}

PAPER TEXT:
${body.text}`;

    const { text: raw, usage } = await runModel({
      provider: body.provider,
      model: body.model,
      system,
      user,
    });

    const obj = requireJsonObject(raw);
    const parsed = structuredAnalysisSchema.parse(obj);
    return NextResponse.json({ result: parsed, usage });
  } catch (err: unknown) {
    return jsonError(getErrorMessage(err), 400);
  }
}
