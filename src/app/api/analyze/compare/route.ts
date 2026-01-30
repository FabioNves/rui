import { NextResponse } from "next/server";
import { z } from "zod";
import { runModel } from "@/lib/ai/providers";
import { providerSchema, pairwiseComparisonSchema } from "@/lib/ai/schemas";
import { getErrorMessage, jsonError, requireJsonObject } from "../_shared";

export const runtime = "nodejs";

// New schema for pairwise comparison (one related article at a time)
const bodySchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
  main: z.object({
    id: z.string(),
    title: z.string().optional(),
    year: z.number().optional(),
    structured: z.any(),
    critique: z.any().optional(),
  }),
  related: z.object({
    id: z.string(),
    title: z.string().optional(),
    year: z.number().optional(),
    structured: z.any(),
    critique: z.any().optional(),
  }),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());

    const system = `You are a research synthesis assistant specializing in comparative analysis of academic papers. 
Your task is to provide a thorough, objective comparison between two papers.
Return ONLY valid JSON (no markdown, no code fences).
Be critical and precise. If papers are not related in topic or methodology, clearly state this.`;

    const user = `Compare the MAIN paper against the RELATED paper in detail.

MAIN PAPER:
Title: ${body.main.title ?? "Unknown"}
Year: ${body.main.year ?? "Unknown"}
Structured Analysis: ${JSON.stringify(body.main.structured, null, 2)}
${body.main.critique ? `Critical Review: ${JSON.stringify(body.main.critique, null, 2)}` : ""}

RELATED PAPER:
Title: ${body.related.title ?? "Unknown"}
Year: ${body.related.year ?? "Unknown"}
Structured Analysis: ${JSON.stringify(body.related.structured, null, 2)}
${body.related.critique ? `Critical Review: ${JSON.stringify(body.related.critique, null, 2)}` : ""}

Output JSON with this exact structure:
{
  "relatedId": "${body.related.id}",
  "relatedTitle": "${body.related.title ?? "Unknown"}",
  
  "isRelated": boolean, // TRUE if papers share research topic/domain, FALSE if completely unrelated
  "relatednessScore": number, // 1-5 scale: 1=not related, 3=somewhat related, 5=highly related
  "relatednessExplanation": string, // Explain why papers are or aren't related
  
  "summary": string, // 2-3 sentence overall comparison summary
  
  "dimensions": [
    {
      "dimension": "researchQuestion" | "methodology" | "sampleSize" | "dataCollection" | "analysis" | "findings" | "limitations" | "theoreticalFramework" | "practicalImplications",
      "label": string, // Human-readable label
      "mainSummary": string, // How main paper addresses this
      "relatedSummary": string, // How related paper addresses this
      "mainScore": number, // 1-5 quality/rigor score (optional)
      "relatedScore": number, // 1-5 quality/rigor score (optional)
      "verdict": "main_stronger" | "related_stronger" | "comparable" | "not_applicable",
      "confidence": "high" | "medium" | "low"
    }
  ], // Include at least 5-7 dimensions
  
  "similarities": [
    { "claim": string, "confidence": "high" | "medium" | "low" }
  ],
  
  "differences": [
    { "claim": string, "confidence": "high" | "medium" | "low", "favoredPaper": "main" | "related" | "neutral" }
  ],
  
  "gapAnalysis": {
    "uniqueToMain": string[], // What main paper covers that related doesn't
    "uniqueToRelated": string[], // What related paper covers that main doesn't
    "sharedGaps": string[] // Limitations/gaps present in both papers
  },
  
  "contradictions": [
    {
      "topic": string,
      "mainPosition": string,
      "relatedPosition": string,
      "possibleExplanation": string
    }
  ], // Empty array if no contradictions found
  
  "methodologicalRigor": {
    "sampleSizeAdequacy": { "main": string, "related": string, "verdict": "main_stronger" | "related_stronger" | "comparable" },
    "biasControls": { "main": string, "related": string, "verdict": "main_stronger" | "related_stronger" | "comparable" },
    "statisticalRigor": { "main": string, "related": string, "verdict": "main_stronger" | "related_stronger" | "comparable" },
    "replicability": { "main": string, "related": string, "verdict": "main_stronger" | "related_stronger" | "comparable" }
  },
  
  "temporalContext": {
    "chronologicalNote": string, // If years differ, note which came first
    "methodologicalEvolution": string, // How methods may have evolved
    "findingsProgression": string // How findings build on each other
  },
  
  "overallVerdict": {
    "strongerPaper": "main" | "related" | "comparable",
    "explanation": string
  },
  
  "recommendations": {
    "forResearchers": string[], // Suggestions for future research
    "forPractitioners": string[], // Practical takeaways
    "synthesizedConclusion": string // What we learn from comparing these papers
  }
}

Writing Style Rules:
- Use professional, formal academic language throughout.
- Do NOT use em dashes (—) or informal punctuation.
- Be objective and balanced in comparisons.
- If papers are NOT related (different domains/topics), set isRelated=false and relatednessScore=1-2, and still fill other fields as best as possible while noting the limitation.
`;

    const { text: raw, usage } = await runModel({
      provider: body.provider,
      model: body.model,
      system,
      user,
    });

    const obj = requireJsonObject(raw);
    const parsed = pairwiseComparisonSchema.parse(obj);
    return NextResponse.json({ result: parsed, usage });
  } catch (err: unknown) {
    return jsonError(getErrorMessage(err), 400);
  }
}
