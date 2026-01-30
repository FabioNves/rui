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

// Individual comparison between main article and ONE related article
export const pairwiseComparisonSchema = z.object({
  relatedId: z.string(),
  relatedTitle: z.string().optional(),

  // Is this article actually related?
  isRelated: z.boolean(),
  relatednessScore: z.number().min(1).max(5), // 1 = not related, 5 = highly related
  relatednessExplanation: z.string(),

  // Overview
  summary: z.string(),

  // Structured comparison dimensions with scores
  dimensions: z
    .array(
      z.object({
        dimension: z.enum([
          "researchQuestion",
          "methodology",
          "sampleSize",
          "dataCollection",
          "analysis",
          "findings",
          "limitations",
          "theoreticalFramework",
          "practicalImplications",
        ]),
        label: z.string(),
        mainSummary: z.string(),
        relatedSummary: z.string(),
        mainScore: z.number().min(1).max(5).optional(), // Quality/rigor score
        relatedScore: z.number().min(1).max(5).optional(),
        verdict: z.enum([
          "main_stronger",
          "related_stronger",
          "comparable",
          "not_applicable",
        ]),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .default([]),

  // Similarities and differences with confidence
  similarities: z
    .array(
      z.object({
        claim: z.string(),
        confidence: z.enum(["high", "medium", "low"]),
      }),
    )
    .default([]),

  differences: z
    .array(
      z.object({
        claim: z.string(),
        confidence: z.enum(["high", "medium", "low"]),
        favoredPaper: z.enum(["main", "related", "neutral"]).optional(),
      }),
    )
    .default([]),

  // Gap analysis
  gapAnalysis: z
    .object({
      uniqueToMain: z.array(z.string()).default([]), // What main does that related doesn't
      uniqueToRelated: z.array(z.string()).default([]), // What related does that main doesn't
      sharedGaps: z.array(z.string()).default([]), // Gaps neither paper addresses
    })
    .default({ uniqueToMain: [], uniqueToRelated: [], sharedGaps: [] }),

  // Contradictions/disagreements
  contradictions: z
    .array(
      z.object({
        topic: z.string(),
        mainPosition: z.string(),
        relatedPosition: z.string(),
        possibleExplanation: z.string(),
      }),
    )
    .default([]),

  // Methodological rigor comparison
  methodologicalRigor: z
    .object({
      sampleSizeAdequacy: z
        .object({
          main: z.string(),
          related: z.string(),
          verdict: z.enum(["main_stronger", "related_stronger", "comparable"]),
        })
        .optional(),
      biasControls: z
        .object({
          main: z.string(),
          related: z.string(),
          verdict: z.enum(["main_stronger", "related_stronger", "comparable"]),
        })
        .optional(),
      statisticalRigor: z
        .object({
          main: z.string(),
          related: z.string(),
          verdict: z.enum(["main_stronger", "related_stronger", "comparable"]),
        })
        .optional(),
      replicability: z
        .object({
          main: z.string(),
          related: z.string(),
          verdict: z.enum(["main_stronger", "related_stronger", "comparable"]),
        })
        .optional(),
    })
    .default({}),

  // Temporal context (if publication years differ)
  temporalContext: z
    .object({
      chronologicalNote: z.string().optional(),
      methodologicalEvolution: z.string().optional(),
      findingsProgression: z.string().optional(),
    })
    .default({}),

  // Overall verdict and recommendations
  overallVerdict: z.object({
    strongerPaper: z.enum(["main", "related", "comparable"]),
    explanation: z.string(),
  }),

  recommendations: z
    .object({
      forResearchers: z.array(z.string()).default([]),
      forPractitioners: z.array(z.string()).default([]),
      synthesizedConclusion: z.string(),
    })
    .default({
      forResearchers: [],
      forPractitioners: [],
      synthesizedConclusion: "",
    }),
});

export type PairwiseComparison = z.infer<typeof pairwiseComparisonSchema>;

// Legacy schema for backward compatibility
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
