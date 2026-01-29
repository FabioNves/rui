import { NextResponse } from "next/server";
import { z } from "zod";
import { runModel } from "@/lib/ai/providers";
import { providerSchema, finalReportSchema } from "@/lib/ai/schemas";
import { getErrorMessage, jsonError, requireJsonObject } from "../_shared";

export const runtime = "nodejs";

const sectionSchema = z.union([
  z.string(),
  z.object({
    title: z.string(),
    notes: z.string().optional(),
  }),
]);

const settingsSchema = z.object({
  useAPA7: z.boolean().default(true),
  reportLength: z.enum(["concise", "standard", "detailed"]).default("standard"),
  includeCitations: z.boolean().default(true),
});

const bodySchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  structure: z.array(sectionSchema).min(1),
  settings: settingsSchema.optional(),
  main: z.any(),
  related: z.array(z.any()).default([]),
  comparison: z.any().optional(),
});

const LENGTH_INSTRUCTIONS = {
  concise:
    "Write a concise report of approximately 1000-1500 words. Be direct and focus on key points.",
  standard:
    "Write a comprehensive report of approximately 2000-2500 words. Provide thorough analysis with adequate detail.",
  detailed:
    "Write an extensive, detailed report of approximately 4000-5000 words. Provide in-depth analysis with comprehensive coverage of all aspects.",
};

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const settings = body.settings ?? {
      useAPA7: true,
      reportLength: "standard",
      includeCitations: true,
    };

    // Build section list with optional notes
    const sectionList = body.structure
      .map((s, i) => {
        if (typeof s === "string") {
          return `${i + 1}. ${s}`;
        }
        const notes = s.notes ? ` [Notes: ${s.notes}]` : "";
        return `${i + 1}. ${s.title}${notes}`;
      })
      .join("\n");

    const system =
      "You are an expert academic reviewer writing for a scholarly audience. Return ONLY valid JSON (no markdown code fences).";

    const citationRules = settings.useAPA7
      ? settings.includeCitations
        ? "Use APA 7th edition format for ALL citations. Include in-text citations (Author, Year) when referencing works. End with a References section listing all cited works in APA 7 format."
        : "Use APA 7th edition format if you need to cite works. Minimize in-text citations but include a References section if any works are mentioned."
      : settings.includeCitations
        ? "When citing works, use a consistent citation format with in-text references."
        : "Minimize citations. Focus on the analysis itself rather than formal referencing.";

    const user = `Write a final critical analysis report in markdown, using EXACTLY these section headings and order:
${sectionList}

${LENGTH_INSTRUCTIONS[settings.reportLength]}

Use the provided structured/critical analyses and comparison to support your critique.

Main paper:
${JSON.stringify(body.main, null, 2)}

Related papers:
${JSON.stringify(body.related, null, 2)}

Comparison:
${JSON.stringify(body.comparison ?? null, null, 2)}

Output JSON with this exact shape:
{ "markdown": string }

Writing Style Rules:
- Use professional, formal academic language throughout.
- Do NOT use em dashes (—) or informal punctuation. Use commas, semicolons, or separate sentences instead.
- Write in a clear, objective, scholarly tone.
- ${citationRules}

Content Rules:
- Be concrete and critical (strengths, weaknesses, threats to validity, what would convince you).
- Use bullet lists where helpful.
- Do not invent citations or references. Only cite works that are explicitly mentioned in the provided data.
- If a section has [Notes: ...], follow those instructions for that specific section.
`;

    const { text: raw, usage } = await runModel({
      provider: body.provider,
      model: body.model,
      system,
      user,
    });

    const obj = requireJsonObject(raw);
    const parsed = finalReportSchema.parse(obj);
    return NextResponse.json({ result: parsed, usage });
  } catch (err: unknown) {
    return jsonError(getErrorMessage(err), 400);
  }
}
