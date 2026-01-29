import { NextResponse } from "next/server";
import { z } from "zod";
import { runModel } from "@/lib/ai/providers";
import { providerSchema, comparisonSchema } from "@/lib/ai/schemas";
import { getErrorMessage, jsonError, requireJsonObject } from "../_shared";

export const runtime = "nodejs";

const bodySchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  main: z.object({
    id: z.string(),
    title: z.string().optional(),
    structured: z.any(),
    critique: z.any().optional(),
  }),
  related: z.array(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      structured: z.any(),
      critique: z.any().optional(),
    }),
  ),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());

    const system =
      "You are a research synthesis assistant writing for an academic audience. Return ONLY valid JSON (no markdown, no code fences).";

    const user = `Compare the main paper against the related papers.

Main paper:
${JSON.stringify(body.main, null, 2)}

Related papers:
${JSON.stringify(body.related, null, 2)}

Output JSON with this exact shape:
{
  "summary": string,
  "similarities": string[],
  "differences": string[],
  "comparisonDimensions": [
    {
      "dimension": string,
      "main": string,
      "related": [{ "id": string, "notes": string }]
    }
  ]
}

Writing Style Rules:
- Use professional, formal academic language throughout.
- Do NOT use em dashes (—) or informal punctuation. Use commas, semicolons, or separate sentences instead.
- Write in a clear, objective, scholarly tone.
- If citing any works, use APA 7th edition format.

Content Rules:
- Use dimensions like: research question, dataset/population, methodology, evaluation, key findings, limitations.
- Keep it actionable and concise.
`;

    const { text: raw, usage } = await runModel({
      provider: body.provider,
      model: body.model,
      system,
      user,
    });

    const obj = requireJsonObject(raw);
    const parsed = comparisonSchema.parse(obj);
    return NextResponse.json({ result: parsed, usage });
  } catch (err: unknown) {
    return jsonError(getErrorMessage(err), 400);
  }
}
