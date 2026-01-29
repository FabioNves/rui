import { NextResponse } from "next/server";
import { z } from "zod";
import { runModel } from "@/lib/ai/providers";
import { providerSchema, critiqueSchema } from "@/lib/ai/schemas";
import { getErrorMessage, jsonError, requireJsonObject } from "../_shared";

export const runtime = "nodejs";

const bodySchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  titleHint: z.string().optional(),
  text: z.string().min(200),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());

    const system =
      "You are a critical peer reviewer writing for an academic audience. Return ONLY valid JSON (no markdown, no code fences).";

    const user = `Write a critical analysis of the paper, focusing on rigor, validity, and clarity.

Output JSON with this exact shape:
{
  "strengths": string[],
  "weaknesses": string[],
  "methodologyCritique": string,
  "resultsCritique": string,
  "threatsToValidity": string[],
  "reproducibilityNotes": string[],
  "suggestedImprovements": string[]
}

Writing Style Rules:
- Use professional, formal academic language throughout.
- Do NOT use em dashes (—) or informal punctuation. Use commas, semicolons, or separate sentences instead.
- Write in a clear, objective, scholarly tone.
- If citing any works, use APA 7th edition format.

Content Rules:
- Base the critique only on the provided text.
- Be specific (mention what is missing and why it matters).

Title hint: ${body.titleHint ?? "(none)"}

PAPER TEXT:
${body.text}`;

    const { text: raw, usage } = await runModel({
      provider: body.provider,
      model: body.model,
      system,
      user,
    });

    const obj = requireJsonObject(raw);
    const parsed = critiqueSchema.parse(obj);
    return NextResponse.json({ result: parsed, usage });
  } catch (err: unknown) {
    return jsonError(getErrorMessage(err), 400);
  }
}
