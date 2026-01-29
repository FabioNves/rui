import { z } from "zod";

export const providerSchema = z.enum(["openai", "gemini"]);

export const structuredAnalysisSchema = z
  .object({
    title: z.string().optional(),
    researchQuestion: z.string(),
    methodology: z.object({
      design: z.string(),
      data: z.string(),
      analysis: z.string(),
    }),
    keyFindings: z.array(z.string()).default([]),
    contributions: z.array(z.string()).default([]),
    limitations: z.array(z.string()).default([]),
    futureWork: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    shortSummary: z.string(),
  })
  .strict();

export type StructuredAnalysis = z.infer<typeof structuredAnalysisSchema>;

export const critiqueSchema = z
  .object({
    strengths: z.array(z.string()).default([]),
    weaknesses: z.array(z.string()).default([]),
    methodologyCritique: z.string(),
    resultsCritique: z.string(),
    threatsToValidity: z.array(z.string()).default([]),
    reproducibilityNotes: z.array(z.string()).default([]),
    suggestedImprovements: z.array(z.string()).default([]),
  })
  .strict();

export type Critique = z.infer<typeof critiqueSchema>;

export const comparisonSchema = z
  .object({
    summary: z.string(),
    similarities: z.array(z.string()).default([]),
    differences: z.array(z.string()).default([]),
    comparisonDimensions: z
      .array(
        z.object({
          dimension: z.string(),
          main: z.string(),
          related: z.array(z.object({ id: z.string(), notes: z.string() })),
        }),
      )
      .default([]),
  })
  .strict();

export type Comparison = z.infer<typeof comparisonSchema>;

export const finalReportSchema = z
  .object({
    markdown: z.string(),
  })
  .strict();

export type FinalReport = z.infer<typeof finalReportSchema>;
