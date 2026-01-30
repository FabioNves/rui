"use client";

import Image from "next/image";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { extractPdfWithPages, type ExtractedPage } from "@/lib/pdf/extractText";
import { usePersistedState } from "@/lib/usePersistedState";
import { RECOMMENDED_STRUCTURE } from "@/lib/recommendedStructure";
import { renderMarkdownToSafeHtml } from "@/lib/markdown";
import { exportElementToPdf } from "@/lib/pdf/exportReport";
import { exportStructuredAnalysisToPdf } from "@/lib/pdf/exportStructuredAnalysis";

type Provider = "openai" | "gemini";

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
};

// Pricing per 1M tokens in USD (Standard tier from OpenAI pricing)
const MODEL_PRICING: Record<
  string,
  { input: number; cachedInput: number; output: number }
> = {
  "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 14.0 },
  "gpt-5.1": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 2.0 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-5.2-chat-latest": { input: 1.75, cachedInput: 0.175, output: 14.0 },
  "gpt-5.1-chat-latest": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gpt-5-chat-latest": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gpt-5.2-codex": { input: 1.75, cachedInput: 0.175, output: 14.0 },
  "gpt-5.1-codex-max": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gpt-5.1-codex": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gpt-5-codex": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gpt-5.2-pro": { input: 21.0, cachedInput: 21.0, output: 168.0 },
  "gpt-5-pro": { input: 15.0, cachedInput: 15.0, output: 120.0 },
  "gpt-4.1": { input: 2.0, cachedInput: 0.5, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10.0 },
  // Gemini models - approximate pricing
  "gemini-3-pro-preview": { input: 1.25, cachedInput: 0.3, output: 5.0 },
  "gemini-2.5-pro": { input: 1.25, cachedInput: 0.3, output: 5.0 },
  "gemini-2.0-flash": { input: 0.1, cachedInput: 0.025, output: 0.4 },
};

// EUR/USD exchange rate (approximate)
const EUR_USD_RATE = 0.92;

function calculateCost(model: string, usage: TokenUsage): number {
  const pricing = MODEL_PRICING[model] ?? {
    input: 2.0,
    cachedInput: 0.5,
    output: 10.0,
  };
  const cached = usage.cachedInputTokens ?? 0;
  const uncachedInput = usage.inputTokens - cached;

  const inputCost = (uncachedInput / 1_000_000) * pricing.input;
  const cachedCost = (cached / 1_000_000) * pricing.cachedInput;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;

  return (inputCost + cachedCost + outputCost) * EUR_USD_RATE;
}

function formatCost(euros: number): string {
  if (euros < 0.01) {
    return `€${(euros * 100).toFixed(3)}c`;
  }
  return `€${euros.toFixed(4)}`;
}

type Article = {
  id: string;
  doi?: string;
  title?: string;
  authors?: string[];
  year?: number;
  pdfName?: string;
  text?: string;
  extractedPages?: ExtractedPage[];
  structured?: unknown;
  critique?: unknown;
};

type CustomSection = {
  id: string;
  title: string;
  notes: string;
  includeCitations?: boolean;
};

type ReportSettings = {
  useAPA7: boolean;
  reportLength: "concise" | "standard" | "detailed";
  includeCitations: boolean;
};

type AppState = {
  provider: Provider;
  model: string;
  mendeley?: {
    accessToken?: string;
    expiresAt?: number;
  };
  main: Article;
  related: Article[];
  comparison?: unknown;
  structureMode: "recommended" | "custom";
  customStructure: string;
  customSections: CustomSection[];
  reportSettings: ReportSettings;
  finalReportMarkdown?: string;
  stepCosts?: {
    structured?: number;
    critique?: number;
    relatedTotal?: number;
    comparison?: number;
    final?: number;
  };
};

function newId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

const DEFAULT_SECTIONS: CustomSection[] = RECOMMENDED_STRUCTURE.map(
  (title, i) => ({
    id: `section-${i}`,
    title,
    notes: "",
    includeCitations: true,
  }),
);

const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  useAPA7: true,
  reportLength: "standard",
  includeCitations: true,
};

const DEFAULT_STATE: AppState = {
  provider: "openai",
  model: "gpt-5.2",
  mendeley: {},
  main: { id: "main" },
  related: [],
  structureMode: "recommended",
  customStructure: RECOMMENDED_STRUCTURE.join("\n"),
  customSections: DEFAULT_SECTIONS,
  reportSettings: DEFAULT_REPORT_SETTINGS,
  stepCosts: {},
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await resp.json().catch(() => ({}));
  const err =
    data && typeof data === "object" && "error" in data
      ? (data as { error?: unknown }).error
      : undefined;
  if (!resp.ok)
    throw new Error(
      typeof err === "string" ? err : `Request failed (${resp.status})`,
    );
  return data as T;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "Request failed";
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-zinc-900 px-2 py-0.5 text-xs font-medium text-zinc-100 shadow-sm">
      {children}
    </span>
  );
}

function WorkflowItem({
  label,
  done,
  partial,
  disabled,
  cost,
}: {
  label: string;
  done: boolean;
  partial?: boolean;
  disabled?: boolean;
  cost?: number;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 text-xs ${disabled ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2">
        {done ? (
          <svg
            className="h-4 w-4 text-emerald-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        ) : partial ? (
          <svg
            className="h-4 w-4 text-amber-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <div className="h-4 w-4 rounded-full border-2 border-zinc-600" />
        )}
        <span className={done ? "text-zinc-300" : "text-zinc-500"}>
          {label}
        </span>
      </div>
      {cost !== undefined && cost > 0 && (
        <span className="text-emerald-400 font-medium">€{cost.toFixed(2)}</span>
      )}
    </div>
  );
}

type StructuredAnalysisData = {
  title?: string;
  researchQuestion?: string;
  methodology?: {
    design?: string;
    data?: string;
    analysis?: string;
  };
  keyFindings?: string[];
  contributions?: string[];
  limitations?: string[];
  futureWork?: string[];
  keywords?: string[];
  shortSummary?: string;
};

function AnalysisSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-200">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function AnalysisListItems({ items }: { items?: string[] }) {
  if (!items || items.length === 0) {
    return <p className="text-sm italic text-zinc-500">None identified</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-zinc-300">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function StructuredAnalysisView({
  data,
  articleTitle,
}: {
  data: StructuredAnalysisData;
  articleTitle?: string;
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-emerald-950/50 to-cyan-950/50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-50">
              {data.title ?? articleTitle ?? "Untitled Article"}
            </h3>
            {data.keywords && data.keywords.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400">
            <svg
              className="h-3.5 w-3.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Analyzed
          </div>
        </div>
      </div>

      {/* Summary */}
      {data.shortSummary && (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-cyan-300">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Summary
          </div>
          <p className="text-sm leading-relaxed text-zinc-300">
            {data.shortSummary}
          </p>
        </div>
      )}

      {/* Research Question */}
      {data.researchQuestion && (
        <AnalysisSection
          title="Research Question"
          icon={
            <svg
              className="h-4 w-4 text-purple-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        >
          <p className="text-sm leading-relaxed text-zinc-300">
            {data.researchQuestion}
          </p>
        </AnalysisSection>
      )}

      {/* Methodology */}
      {data.methodology && (
        <AnalysisSection
          title="Methodology"
          icon={
            <svg
              className="h-4 w-4 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          }
        >
          <div className="space-y-3">
            {data.methodology.design && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Design
                </div>
                <p className="mt-1 text-sm text-zinc-300">
                  {data.methodology.design}
                </p>
              </div>
            )}
            {data.methodology.data && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Data
                </div>
                <p className="mt-1 text-sm text-zinc-300">
                  {data.methodology.data}
                </p>
              </div>
            )}
            {data.methodology.analysis && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Analysis
                </div>
                <p className="mt-1 text-sm text-zinc-300">
                  {data.methodology.analysis}
                </p>
              </div>
            )}
          </div>
        </AnalysisSection>
      )}

      {/* Key Findings */}
      <AnalysisSection
        title="Key Findings"
        icon={
          <svg
            className="h-4 w-4 text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        }
      >
        <AnalysisListItems items={data.keyFindings} />
      </AnalysisSection>

      {/* Contributions */}
      <AnalysisSection
        title="Contributions"
        icon={
          <svg
            className="h-4 w-4 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
        }
      >
        <AnalysisListItems items={data.contributions} />
      </AnalysisSection>

      {/* Limitations */}
      <AnalysisSection
        title="Limitations"
        icon={
          <svg
            className="h-4 w-4 text-orange-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        }
      >
        <AnalysisListItems items={data.limitations} />
      </AnalysisSection>

      {/* Future Work */}
      <AnalysisSection
        title="Future Work"
        icon={
          <svg
            className="h-4 w-4 text-indigo-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        }
      >
        <AnalysisListItems items={data.futureWork} />
      </AnalysisSection>
    </div>
  );
}

type CriticalReviewData = {
  strengths?: string[];
  weaknesses?: string[];
  methodologyCritique?: string;
  resultsCritique?: string;
  threatsToValidity?: string[];
  reproducibilityNotes?: string[];
  suggestedImprovements?: string[];
};

function CriticalReviewView({
  data,
  articleTitle,
}: {
  data: CriticalReviewData;
  articleTitle?: string;
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-amber-950/50 to-orange-950/50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-50">
              Critical Review
            </h3>
            {articleTitle && (
              <p className="mt-1 text-sm text-zinc-400">{articleTitle}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-400">
            <svg
              className="h-3.5 w-3.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Reviewed
          </div>
        </div>
      </div>

      {/* Strengths */}
      <AnalysisSection
        title="Strengths"
        icon={
          <svg
            className="h-4 w-4 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        }
      >
        <AnalysisListItems items={data.strengths} />
      </AnalysisSection>

      {/* Weaknesses */}
      <AnalysisSection
        title="Weaknesses"
        icon={
          <svg
            className="h-4 w-4 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        }
      >
        <AnalysisListItems items={data.weaknesses} />
      </AnalysisSection>

      {/* Methodology Critique */}
      {data.methodologyCritique && (
        <AnalysisSection
          title="Methodology Critique"
          icon={
            <svg
              className="h-4 w-4 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          }
        >
          <p className="text-sm leading-relaxed text-zinc-300">
            {data.methodologyCritique}
          </p>
        </AnalysisSection>
      )}

      {/* Results Critique */}
      {data.resultsCritique && (
        <AnalysisSection
          title="Results Critique"
          icon={
            <svg
              className="h-4 w-4 text-cyan-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          }
        >
          <p className="text-sm leading-relaxed text-zinc-300">
            {data.resultsCritique}
          </p>
        </AnalysisSection>
      )}

      {/* Threats to Validity */}
      <AnalysisSection
        title="Threats to Validity"
        icon={
          <svg
            className="h-4 w-4 text-orange-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        }
      >
        <AnalysisListItems items={data.threatsToValidity} />
      </AnalysisSection>

      {/* Reproducibility Notes */}
      <AnalysisSection
        title="Reproducibility Notes"
        icon={
          <svg
            className="h-4 w-4 text-purple-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        }
      >
        <AnalysisListItems items={data.reproducibilityNotes} />
      </AnalysisSection>

      {/* Suggested Improvements */}
      <AnalysisSection
        title="Suggested Improvements"
        icon={
          <svg
            className="h-4 w-4 text-indigo-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        }
      >
        <AnalysisListItems items={data.suggestedImprovements} />
      </AnalysisSection>
    </div>
  );
}

type ComparativeAnalysisData = {
  summary?: string;
  similarities?: string[];
  differences?: string[];
  comparisonDimensions?: Array<{
    dimension: string;
    main: string;
    related: Array<{ id: string; notes: string }>;
  }>;
};

function ComparativeAnalysisView({
  data,
  mainTitle,
  relatedTitles,
}: {
  data: ComparativeAnalysisData;
  mainTitle?: string;
  relatedTitles: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-purple-950/50 to-pink-950/50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-50">
              Comparative Analysis
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              Comparing {mainTitle ?? "main article"} with{" "}
              {Object.keys(relatedTitles).length} related{" "}
              {Object.keys(relatedTitles).length === 1 ? "article" : "articles"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-purple-500/20 px-3 py-1 text-xs font-medium text-purple-400">
            <svg
              className="h-3.5 w-3.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Compared
          </div>
        </div>
      </div>

      {/* Summary */}
      {data.summary && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-950/20 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-purple-300">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Summary
          </div>
          <p className="text-sm leading-relaxed text-zinc-300">
            {data.summary}
          </p>
        </div>
      )}

      {/* Similarities */}
      <AnalysisSection
        title="Similarities"
        icon={
          <svg
            className="h-4 w-4 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        }
      >
        <AnalysisListItems items={data.similarities} />
      </AnalysisSection>

      {/* Differences */}
      <AnalysisSection
        title="Differences"
        icon={
          <svg
            className="h-4 w-4 text-orange-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
        }
      >
        <AnalysisListItems items={data.differences} />
      </AnalysisSection>

      {/* Comparison Dimensions */}
      {data.comparisonDimensions && data.comparisonDimensions.length > 0 && (
        <AnalysisSection
          title="Detailed Comparison"
          icon={
            <svg
              className="h-4 w-4 text-cyan-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
              />
            </svg>
          }
        >
          <div className="space-y-4">
            {data.comparisonDimensions.map((dim, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/5 bg-zinc-900/30 p-3"
              >
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  {dim.dimension}
                </div>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs font-medium text-zinc-500">
                      Main:{" "}
                    </span>
                    <span className="text-sm text-zinc-300">{dim.main}</span>
                  </div>
                  {dim.related.map((rel, j) => (
                    <div key={j}>
                      <span className="text-xs font-medium text-zinc-500">
                        {relatedTitles[rel.id] ?? rel.id}:{" "}
                      </span>
                      <span className="text-sm text-zinc-300">{rel.notes}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </AnalysisSection>
      )}
    </div>
  );
}

function ExtractedContentView({
  pages,
  text,
  pdfName,
  onTextChange,
}: {
  pages?: ExtractedPage[];
  text?: string;
  pdfName?: string;
  onTextChange: (text: string) => void;
}) {
  const [viewMode, setViewMode] = React.useState<"pages" | "raw">(
    pages && pages.length > 0 ? "pages" : "raw",
  );
  const [expandedPage, setExpandedPage] = React.useState<number | null>(null);
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);

  const totalImages = pages?.reduce((sum, p) => sum + p.images.length, 0) ?? 0;
  const totalChars = text?.length ?? 0;

  // When pages change (new extraction), switch to pages view if available
  React.useEffect(() => {
    if (pages && pages.length > 0) {
      setViewMode("pages");
    }
  }, [pages]);

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-zinc-900/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="text-sm text-zinc-300">
              {pages ? `${pages.length} pages` : "No pages"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm text-zinc-300">
              {totalImages} {totalImages === 1 ? "image" : "images"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
              />
            </svg>
            <span className="text-sm text-zinc-300">
              {totalChars.toLocaleString()} chars
            </span>
          </div>
        </div>
        {pdfName && (
          <span
            className="text-xs text-zinc-500 truncate max-w-[200px]"
            title={pdfName}
          >
            {pdfName}
          </span>
        )}
      </div>

      {/* View mode toggle */}
      {pages && pages.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("pages")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              viewMode === "pages"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            Page View
          </button>
          <button
            onClick={() => setViewMode("raw")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              viewMode === "raw"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
            Raw Text
          </button>
        </div>
      )}

      {/* Content */}
      {viewMode === "pages" && pages && pages.length > 0 ? (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-2">
          {pages.map((page) => (
            <div
              key={page.pageNumber}
              className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden"
            >
              {/* Page header */}
              <button
                onClick={() =>
                  setExpandedPage(
                    expandedPage === page.pageNumber ? null : page.pageNumber,
                  )
                }
                className="flex w-full items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 text-sm font-semibold text-zinc-300">
                    {page.pageNumber}
                  </span>
                  <span className="text-sm text-zinc-300">
                    Page {page.pageNumber}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {page.text.length.toLocaleString()} chars
                  </span>
                  {page.images.length > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-400">
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      {page.images.length}
                    </span>
                  )}
                </div>
                <svg
                  className={`h-4 w-4 text-zinc-400 transition-transform ${
                    expandedPage === page.pageNumber ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Expanded content */}
              {expandedPage === page.pageNumber && (
                <div className="border-t border-white/5 p-4 space-y-4">
                  {/* Images */}
                  {page.images.length > 0 && (
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Images ({page.images.length})
                      </h4>
                      <div className="flex flex-wrap gap-3">
                        {page.images.map((img, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedImage(img.dataUrl)}
                            className="group relative overflow-hidden rounded-lg border border-white/10 bg-zinc-800 hover:border-emerald-500/50 transition"
                          >
                            <img
                              src={img.dataUrl}
                              alt={`Page ${page.pageNumber} image ${idx + 1}`}
                              className="h-24 w-auto max-w-[200px] object-contain"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition">
                              <svg
                                className="h-6 w-6 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                                />
                              </svg>
                            </div>
                            <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-300">
                              {img.width}×{img.height}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Text */}
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Text Content
                    </h4>
                    <div className="max-h-[300px] overflow-y-auto rounded-lg bg-zinc-950 p-3">
                      <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-zinc-300">
                        {page.text || "(No text on this page)"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <textarea
          value={text ?? ""}
          onChange={(e) => onTextChange(e.target.value)}
          className="min-h-[60vh] w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 font-mono text-sm leading-relaxed text-zinc-100"
          placeholder="Paste article text here if you don't have a PDF…"
        />
      )}

      {/* Image preview modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-8"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-h-full max-w-full">
            <img
              src={selectedImage}
              alt="Expanded view"
              className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -right-3 -top-3 rounded-full bg-zinc-800 p-2 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  children,
  right,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950/60 p-5 shadow-sm backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-zinc-50">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Modal({
  open,
  onClose,
  title,
  children,
  onDownload,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onDownload?: () => void | Promise<void>;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/50 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-50">{title}</h3>
          <div className="flex items-center gap-2">
            {onDownload && (
              <button
                onClick={onDownload}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className="max-h-[calc(90vh-60px)] overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const {
    hydrated,
    value: state,
    setValue: setState,
  } = usePersistedState("rui.state.v1", DEFAULT_STATE);

  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reportHtml, setReportHtml] = React.useState<string>("");
  const [logMessages, setLogMessages] = React.useState<
    { time: string; text: string }[]
  >([]);
  const [sessionCost, setSessionCost] = React.useState<{
    tokens: number;
    euros: number;
  }>({ tokens: 0, euros: 0 });

  const addLog = (text: string) => {
    const time = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogMessages((prev) => [...prev, { time, text }]);
  };

  const addUsageLog = (usage: TokenUsage, model: string): number => {
    const cost = calculateCost(model, usage);
    const totalTokens = usage.inputTokens + usage.outputTokens;
    setSessionCost((prev) => ({
      tokens: prev.tokens + totalTokens,
      euros: prev.euros + cost,
    }));
    addLog(
      `📊 Tokens: ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out${usage.cachedInputTokens ? ` (${usage.cachedInputTokens.toLocaleString()} cached)` : ""}`,
    );
    addLog(`💰 Cost: ${formatCost(cost)}`);
    return cost;
  };

  const clearLog = () => {
    setLogMessages([]);
    setSessionCost({ tokens: 0, euros: 0 });
  };

  const [textModalOpen, setTextModalOpen] = React.useState(false);
  const [structuredModalOpen, setStructuredModalOpen] = React.useState(false);
  const [critiqueModalOpen, setCritiqueModalOpen] = React.useState(false);
  const [helpModalOpen, setHelpModalOpen] = React.useState(false);
  const [comparisonModalOpen, setComparisonModalOpen] = React.useState(false);
  const [finalReportModalOpen, setFinalReportModalOpen] = React.useState(false);
  const [mobileActivityOpen, setMobileActivityOpen] = React.useState(false);
  // State for related article modals - stores the article id or null
  const [relatedTextModalId, setRelatedTextModalId] = React.useState<
    string | null
  >(null);
  const [relatedStructuredModalId, setRelatedStructuredModalId] =
    React.useState<string | null>(null);
  const [relatedCritiqueModalId, setRelatedCritiqueModalId] = React.useState<
    string | null
  >(null);
  // State for tracking which related articles are expanded
  const [expandedRelated, setExpandedRelated] = React.useState<Set<string>>(
    new Set(),
  );

  const toggleRelatedExpanded = (id: string) => {
    setExpandedRelated((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const reportRef = React.useRef<HTMLDivElement | null>(null);

  const setProvider = (provider: Provider) => {
    setState((s) => ({
      ...s,
      provider,
      model: provider === "openai" ? "gpt-5.2" : "gemini-3-pro-preview",
    }));
  };

  const updateMain = (patch: Partial<Article>) =>
    setState((s) => ({ ...s, main: { ...s.main, ...patch } }));

  const updateRelated = (id: string, patch: Partial<Article>) =>
    setState((s) => ({
      ...s,
      related: s.related.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  const addRelated = () =>
    setState((s) => ({
      ...s,
      related: [...s.related, { id: newId() }],
    }));

  const deleteRelated = (id: string) =>
    setState((s) => ({
      ...s,
      related: s.related.filter((a) => a.id !== id),
    }));

  const lookupDoi = async (doi: string, target: "main" | string) => {
    setError(null);
    setBusy("Looking up DOI metadata…");
    try {
      const meta = await postJson<{
        title?: string;
        authors: string[];
        year?: number;
      }>("/api/doi/lookup", { doi });
      if (target === "main") {
        updateMain({
          title: meta.title,
          authors: meta.authors,
          year: meta.year,
        });
      } else {
        updateRelated(target, {
          title: meta.title,
          authors: meta.authors,
          year: meta.year,
        });
      }
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const connectMendeley = async () => {
    setError(null);
    setBusy("Opening Mendeley authorization…");
    try {
      const stateToken = newId() + newId();
      localStorage.setItem("rui.mendeley.state", stateToken);
      const { url } = await postJson<{ url: string }>(
        "/api/mendeley/auth-url",
        {
          state: stateToken,
        },
      );
      window.location.href = url;
    } catch (e: unknown) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  const searchMendeley = async (queryOrDoi: string): Promise<MendeleyDoc[]> => {
    setError(null);
    setBusy("Searching Mendeley…");
    try {
      const accessToken = state.mendeley?.accessToken;
      if (!accessToken) throw new Error("Connect Mendeley first");
      const res = await postJson<{ results: MendeleyDoc[] }>(
        "/api/mendeley/search",
        {
          accessToken,
          query: queryOrDoi,
          doi: queryOrDoi.includes("/") ? queryOrDoi : undefined,
          limit: 10,
        },
      );
      return res.results;
    } finally {
      setBusy(null);
    }
  };

  const fetchMendeleyLibrary = async (
    offset = 0,
  ): Promise<{
    results: MendeleyLibraryDoc[];
    hasMore: boolean;
    totalCount?: number;
  }> => {
    const accessToken = state.mendeley?.accessToken;
    if (!accessToken) throw new Error("Connect Mendeley first");
    const res = await postJson<{
      results: MendeleyLibraryDoc[];
      hasMore: boolean;
      totalCount?: number;
    }>("/api/mendeley/library", {
      accessToken,
      limit: 50,
      offset,
      sort: "last_modified",
      order: "desc",
    });
    return res;
  };

  const runStructured = async (target: "main" | string) => {
    setError(null);
    clearLog();
    const article =
      target === "main"
        ? state.main
        : state.related.find((r) => r.id === target);
    if (!article) return;
    if (!article.text || article.text.length < 200) {
      setError("Provide a PDF or paste text first.");
      return;
    }
    setBusy("Running structured analysis…");
    const label =
      article.title ?? (target === "main" ? "main article" : "related article");

    // Detailed progress logging
    addLog(`📄 Starting structured analysis for "${label}"`);
    addLog(
      `🤖 Provider: ${state.provider.toUpperCase()} | Model: ${state.model}`,
    );
    addLog(
      `📊 Document size: ${article.text.length.toLocaleString()} characters (~${Math.ceil(article.text.length / 4).toLocaleString()} tokens)`,
    );
    addLog("─".repeat(40));

    // Progress simulation - these messages appear while waiting for the API
    const progressMessages = [
      { delay: 500, msg: "📖 Reading document content..." },
      {
        delay: 2000,
        msg: "🔍 Identifying research question and objectives...",
      },
      { delay: 4000, msg: "🧪 Analyzing methodology section..." },
      { delay: 6000, msg: "📈 Extracting key findings and results..." },
      { delay: 8000, msg: "💡 Identifying contributions and novelty..." },
      { delay: 10000, msg: "⚠️ Evaluating limitations..." },
      { delay: 12000, msg: "🔮 Reviewing future work directions..." },
      { delay: 14000, msg: "🏷️ Generating keywords..." },
      { delay: 16000, msg: "✍️ Composing summary..." },
      { delay: 20000, msg: "⏳ Still processing (large document)..." },
      { delay: 30000, msg: "⏳ Almost there..." },
    ];

    const timeouts: NodeJS.Timeout[] = [];
    let completed = false;

    // Schedule progress messages
    for (const { delay, msg } of progressMessages) {
      const timeout = setTimeout(() => {
        if (!completed) addLog(msg);
      }, delay);
      timeouts.push(timeout);
    }

    try {
      addLog("📤 Sending request to AI...");
      const response = await postJson<{ result: unknown; usage: TokenUsage }>(
        "/api/analyze/structured",
        {
          provider: state.provider,
          model: state.model,
          titleHint: article.title,
          doi: article.doi,
          text: article.text,
        },
      );

      // Clear pending progress messages
      completed = true;
      timeouts.forEach(clearTimeout);

      addLog("─".repeat(40));
      addLog("📥 Received response from AI");
      const cost = addUsageLog(response.usage, state.model);
      addLog("🔄 Validating and parsing response...");

      if (target === "main") {
        updateMain({ structured: response.result });
        setState((s) => ({
          ...s,
          stepCosts: { ...s.stepCosts, structured: cost },
        }));
      } else {
        updateRelated(target, { structured: response.result });
        setState((s) => ({
          ...s,
          stepCosts: {
            ...s.stepCosts,
            relatedTotal: (s.stepCosts?.relatedTotal ?? 0) + cost,
          },
        }));
      }

      // Show what was extracted
      const result = response.result as {
        title?: string;
        keyFindings?: string[];
        contributions?: string[];
        limitations?: string[];
        keywords?: string[];
      };

      addLog("─".repeat(40));
      addLog("📋 Extraction Summary:");
      if (result.title) addLog(`   Title: "${result.title}"`);
      if (result.keyFindings)
        addLog(`   Key findings: ${result.keyFindings.length} items`);
      if (result.contributions)
        addLog(`   Contributions: ${result.contributions.length} items`);
      if (result.limitations)
        addLog(`   Limitations: ${result.limitations.length} items`);
      if (result.keywords) addLog(`   Keywords: ${result.keywords.join(", ")}`);
      addLog("─".repeat(40));
      addLog("✅ Structured analysis complete!");

      // Auto-open the modal
      if (target === "main") {
        setStructuredModalOpen(true);
      } else {
        setRelatedStructuredModalId(target);
      }
    } catch (e: unknown) {
      completed = true;
      timeouts.forEach(clearTimeout);
      addLog("─".repeat(40));
      addLog(`❌ Error: ${errorMessage(e)}`);
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const runCritique = async (target: "main" | string) => {
    setError(null);
    const article =
      target === "main"
        ? state.main
        : state.related.find((r) => r.id === target);
    if (!article) return;
    if (!article.text || article.text.length < 200) {
      setError("Provide a PDF or paste text first.");
      return;
    }
    setBusy("Running critical review…");
    const label =
      article.title ?? (target === "main" ? "main article" : "related article");
    addLog(`🔍 Starting critical review for "${label}"`);
    try {
      const response = await postJson<{ result: unknown; usage: TokenUsage }>(
        "/api/analyze/critique",
        {
          provider: state.provider,
          model: state.model,
          titleHint: article.title,
          text: article.text,
        },
      );
      const cost = addUsageLog(response.usage, state.model);
      if (target === "main") {
        updateMain({ critique: response.result });
        setState((s) => ({
          ...s,
          stepCosts: { ...s.stepCosts, critique: cost },
        }));
      } else {
        updateRelated(target, { critique: response.result });
        setState((s) => ({
          ...s,
          stepCosts: {
            ...s.stepCosts,
            relatedTotal: (s.stepCosts?.relatedTotal ?? 0) + cost,
          },
        }));
      }
      addLog("✅ Critical review complete!");
    } catch (e: unknown) {
      addLog(`❌ Error: ${errorMessage(e)}`);
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const runCompare = async () => {
    setError(null);
    clearLog();
    if (!state.main.structured) {
      setError("Run structured analysis for the main article first.");
      return;
    }
    const eligible = state.related.filter((r) => r.structured);
    if (eligible.length === 0) {
      setError("Add and analyze at least one related article first.");
      return;
    }
    setBusy("Running comparative analysis…");

    // Detailed progress logging
    addLog(`📊 Starting comparative analysis`);
    addLog(
      `🤖 Provider: ${state.provider.toUpperCase()} | Model: ${state.model}`,
    );
    addLog("─".repeat(40));
    addLog(`📄 Main article: "${state.main.title ?? "Untitled"}"`);
    eligible.forEach((r, i) => {
      addLog(`📄 Related ${i + 1}: "${r.title ?? "Untitled"}"`);
    });
    addLog("─".repeat(40));

    // Progress simulation
    const progressMessages = [
      { delay: 500, msg: "🔍 Analyzing main article structure..." },
      { delay: 2000, msg: "📚 Processing related articles..." },
      { delay: 4000, msg: "🔄 Identifying similarities..." },
      { delay: 6000, msg: "⚖️ Identifying differences..." },
      { delay: 8000, msg: "📐 Building comparison dimensions..." },
      { delay: 12000, msg: "✍️ Generating summary..." },
      { delay: 18000, msg: "⏳ Still processing..." },
    ];

    const timeouts: NodeJS.Timeout[] = [];
    let completed = false;

    for (const { delay, msg } of progressMessages) {
      const timeout = setTimeout(() => {
        if (!completed) addLog(msg);
      }, delay);
      timeouts.push(timeout);
    }

    try {
      addLog("📤 Sending request to AI...");
      const response = await postJson<{
        result: ComparativeAnalysisData;
        usage: TokenUsage;
      }>("/api/analyze/compare", {
        provider: state.provider,
        model: state.model,
        main: {
          id: state.main.id,
          title: state.main.title,
          structured: state.main.structured,
          critique: state.main.critique,
        },
        related: eligible.map((r) => ({
          id: r.id,
          title: r.title,
          structured: r.structured,
          critique: r.critique,
        })),
      });

      completed = true;
      timeouts.forEach(clearTimeout);

      addLog("─".repeat(40));
      addLog("📥 Received response from AI");
      const cost = addUsageLog(response.usage, state.model);

      // Show what was found
      const result = response.result;
      addLog("─".repeat(40));
      addLog("📋 Comparison Summary:");
      if (result.similarities)
        addLog(`   Similarities: ${result.similarities.length} items`);
      if (result.differences)
        addLog(`   Differences: ${result.differences.length} items`);
      if (result.comparisonDimensions)
        addLog(`   Dimensions: ${result.comparisonDimensions.length} aspects`);
      addLog("─".repeat(40));

      setState((s) => ({
        ...s,
        comparison: response.result,
        stepCosts: { ...s.stepCosts, comparison: cost },
      }));
      addLog("✅ Comparative analysis complete!");
    } catch (e: unknown) {
      completed = true;
      timeouts.forEach(clearTimeout);
      addLog("─".repeat(40));
      addLog(`❌ Error: ${errorMessage(e)}`);
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const runFinal = async () => {
    setError(null);
    clearLog();
    if (!state.main.structured || !state.main.critique) {
      setError(
        "Run structured analysis + critical review for the main article first.",
      );
      return;
    }

    // Build structure based on mode
    let structure: Array<{ title: string; notes?: string }>;
    if (state.structureMode === "recommended") {
      structure = RECOMMENDED_STRUCTURE.map((title) => ({ title }));
    } else {
      structure = (state.customSections ?? []).map((sec) => ({
        title: sec.title,
        notes: sec.notes || undefined,
      }));
    }

    if (structure.length === 0) {
      setError("Your custom structure is empty. Add at least one section.");
      return;
    }

    const settings = state.reportSettings ?? DEFAULT_REPORT_SETTINGS;
    setBusy("Generating final critical analysis…");

    // Detailed progress logging
    addLog(`📝 Starting final critical analysis`);
    addLog(
      `🤖 Provider: ${state.provider.toUpperCase()} | Model: ${state.model}`,
    );
    addLog("─".repeat(40));
    addLog(`📄 Main article: "${state.main.title ?? "Untitled"}"`);
    const relatedWithData = state.related.filter(
      (r) => r.structured || r.critique,
    );
    addLog(`📚 Including ${relatedWithData.length} related articles`);
    addLog(`📐 Report structure: ${structure.length} sections`);
    addLog(`⚙️ Settings:`);
    addLog(`   • Length: ${settings.reportLength}`);
    addLog(`   • APA 7: ${settings.useAPA7 ? "Yes" : "No"}`);
    addLog(`   • Citations: ${settings.includeCitations ? "Yes" : "No"}`);
    if (state.comparison) addLog(`🔄 Including comparative analysis`);
    addLog("─".repeat(40));

    // Progress simulation
    const progressMessages = [
      { delay: 500, msg: "📖 Reading all analyses..." },
      { delay: 3000, msg: "🏗️ Building report structure..." },
      { delay: 6000, msg: "✍️ Writing introduction..." },
      { delay: 10000, msg: "📊 Synthesizing methodology critique..." },
      { delay: 15000, msg: "💡 Analyzing contributions..." },
      { delay: 20000, msg: "⚠️ Evaluating limitations..." },
      { delay: 25000, msg: "📋 Generating conclusions..." },
      { delay: 35000, msg: "⏳ Still processing (comprehensive report)..." },
      { delay: 50000, msg: "⏳ Almost there..." },
    ];

    const timeouts: NodeJS.Timeout[] = [];
    let completed = false;

    for (const { delay, msg } of progressMessages) {
      const timeout = setTimeout(() => {
        if (!completed) addLog(msg);
      }, delay);
      timeouts.push(timeout);
    }

    try {
      addLog("📤 Sending request to AI...");
      const response = await postJson<{
        result: { markdown: string };
        usage: TokenUsage;
      }>("/api/analyze/final", {
        provider: state.provider,
        model: state.model,
        structure,
        settings,
        main: {
          meta: {
            doi: state.main.doi,
            title: state.main.title,
            authors: state.main.authors,
            year: state.main.year,
          },
          structured: state.main.structured,
          critique: state.main.critique,
        },
        related: state.related
          .filter((r) => r.structured || r.critique)
          .map((r) => ({
            id: r.id,
            meta: {
              doi: r.doi,
              title: r.title,
              authors: r.authors,
              year: r.year,
            },
            structured: r.structured,
            critique: r.critique,
          })),
        comparison: state.comparison,
      });

      completed = true;
      timeouts.forEach(clearTimeout);

      addLog("─".repeat(40));
      addLog("📥 Received response from AI");
      const cost = addUsageLog(response.usage, state.model);

      // Show report stats
      const markdown = response.result.markdown;
      const wordCount = markdown.split(/\s+/).length;
      addLog("─".repeat(40));
      addLog("📋 Report Generated:");
      addLog(`   Words: ~${wordCount.toLocaleString()}`);
      addLog(`   Characters: ${markdown.length.toLocaleString()}`);
      addLog("─".repeat(40));

      setState((s) => ({
        ...s,
        finalReportMarkdown: response.result.markdown,
        stepCosts: { ...s.stepCosts, final: cost },
      }));
      addLog("✅ Final report generated!");
    } catch (e: unknown) {
      completed = true;
      timeouts.forEach(clearTimeout);
      addLog("─".repeat(40));
      addLog(`❌ Error: ${errorMessage(e)}`);
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const parsePdfInto = async (file: File, target: "main" | string) => {
    setError(null);
    setBusy("Extracting text and images from PDF…");
    try {
      const extracted = await extractPdfWithPages(file);
      const patch: Partial<Article> = {
        pdfName: file.name,
        text: extracted.fullText,
        extractedPages: extracted.pages,
      };
      if (target === "main") {
        updateMain(patch);
      } else {
        // For related articles, use PDF filename as title if no title exists
        const relatedArticle = state.related.find((r) => r.id === target);
        if (relatedArticle && !relatedArticle.title) {
          // Remove .pdf extension for cleaner title
          const titleFromPdf = file.name.replace(/\.pdf$/i, "");
          patch.title = titleFromPdf;
        }
        updateRelated(target, patch);
      }
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const resetAll = () => {
    if (!confirm("Reset all local data for RUI?")) return;
    setState(DEFAULT_STATE);
  };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!state.finalReportMarkdown) {
        setReportHtml("");
        return;
      }
      const html = await renderMarkdownToSafeHtml(state.finalReportMarkdown);
      if (!cancelled) setReportHtml(html);
    })();
    return () => {
      cancelled = true;
    };
  }, [state.finalReportMarkdown]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8">
        <div className="mx-auto max-w-5xl text-sm text-zinc-300">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(900px_circle_at_20%_10%,rgba(59,130,246,0.18),transparent_55%),radial-gradient(700px_circle_at_80%_20%,rgba(168,85,247,0.16),transparent_55%),radial-gradient(800px_circle_at_40%_90%,rgba(34,197,94,0.10),transparent_55%)]" />
      <header className="relative border-b border-white/10 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3 md:pr-[340px]">
          <div className="flex items-center gap-2 sm:gap-3">
            <Image src="/rui.png" alt="RUI" width={32} height={32} priority />
            <div className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-sm font-bold tracking-tight text-transparent">
              <span className="sm:hidden">RUI</span>
              <span className="hidden sm:inline">
                RUI — Research Understanding Intelligence
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="hidden xs:inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">
              Local-only
            </span>
            {/* Mobile Activity Log Toggle */}
            <button
              onClick={() => setMobileActivityOpen((p) => !p)}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all md:hidden ${
                mobileActivityOpen
                  ? "border-cyan-500/40 bg-cyan-950/50 text-cyan-300"
                  : "border-white/5 bg-zinc-800/60 text-zinc-300 hover:border-cyan-500/20 hover:bg-cyan-950/40 hover:text-cyan-300"
              }`}
              title="Activity Log"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              Activity
            </button>
            <button
              onClick={() => setHelpModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-zinc-800/60 px-2 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:border-white/10 hover:bg-zinc-700/60 hover:text-zinc-100 sm:px-3"
              title="Help & FAQ"
            >
              <svg
                className="h-4 w-4 sm:h-3.5 sm:w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="hidden sm:inline">Questions</span>
            </button>
            <button
              onClick={resetAll}
              className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-zinc-800/60 px-2 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:border-red-500/20 hover:bg-red-950/40 hover:text-red-300 sm:px-3"
              title="Reset"
            >
              <svg
                className="h-4 w-4 sm:h-3.5 sm:w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>
        </div>
      </header>

      {/* Help Modal */}
      <Modal
        open={helpModalOpen}
        onClose={() => setHelpModalOpen(false)}
        title="Help & FAQ"
      >
        <div className="space-y-6 text-sm">
          <section>
            <h3 className="mb-2 font-semibold text-zinc-100">What is RUI?</h3>
            <p className="text-zinc-300">
              RUI (Research Understanding Intelligence) is an AI-powered tool
              that helps you critically analyze academic papers. It extracts key
              information, evaluates quality, compares with related work, and
              generates comprehensive reports.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-zinc-100">
              What is a Structured Analysis?
            </h3>
            <p className="text-zinc-300">
              Extracts <strong>what</strong> the paper says: research question,
              methodology, key findings, contributions, limitations, and future
              work. It&apos;s an objective summary of the paper&apos;s content.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-zinc-100">
              What is a Critical Review?
            </h3>
            <p className="text-zinc-300">
              Evaluates <strong>how well</strong> the research is done:
              strengths, weaknesses, methodology critique, threats to validity,
              and suggested improvements. It&apos;s a peer-reviewer style
              assessment.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-zinc-100">
              What is a Comparative Analysis?
            </h3>
            <p className="text-zinc-300">
              Compares your main paper against related articles you&apos;ve
              added. Identifies similarities, differences, and how the main
              paper positions itself in the field.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-zinc-100">
              What is a Final Critical Analysis?
            </h3>
            <p className="text-zinc-300">
              A comprehensive report combining structured analysis, critical
              review, and comparisons into a single scholarly document. Uses a
              customizable structure and can be exported as PDF.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-zinc-100">
              Workflow Overview
            </h3>
            <ol className="list-inside list-decimal space-y-1 text-zinc-300">
              <li>
                <strong>Settings</strong> — Choose AI provider and model
              </li>
              <li>
                <strong>Main Article</strong> — Add DOI/PDF, run structured
                analysis & critical review
              </li>
              <li>
                <strong>Related Articles</strong> — Add comparison papers with
                the same workflow
              </li>
              <li>
                <strong>Compare</strong> — Run comparative analysis between main
                and related papers
              </li>
              <li>
                <strong>Final Report</strong> — Generate and export a
                comprehensive critical analysis
              </li>
            </ol>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-zinc-100">
              Why can&apos;t I extract text from DOI alone?
            </h3>
            <p className="text-zinc-300">
              DOIs only provide metadata (title, authors, year). Full text is
              protected by publishers. Use the &quot;Open Article&quot; button
              to download the PDF, then upload it here.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-zinc-100">
              Is my data stored anywhere?
            </h3>
            <p className="text-zinc-300">
              All data is stored locally in your browser (localStorage). Nothing
              is sent to external servers except AI API calls. If you connect
              Mendeley, your access token is also stored locally. To erase all
              data and start fresh, press the Reset button in the top bar.
            </p>
          </section>
        </div>
      </Modal>

      {/* Workflow Progress & AI Activity Log - Fixed Right Sidebar */}
      <div
        className={`fixed bottom-4 right-4 top-20 z-40 flex w-80 flex-col rounded-xl border border-cyan-500/30 bg-zinc-950/95 backdrop-blur transition-transform duration-300 ${mobileActivityOpen ? "translate-x-0" : "translate-x-[calc(100%+1rem)]"} md:translate-x-0`}
      >
        {/* Workflow Progress */}
        <div className="border-b border-cyan-500/20 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-zinc-300">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-cyan-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              Workflow Progress
            </div>
            {/* Close button - only visible on mobile */}
            <button
              onClick={() => setMobileActivityOpen(false)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 md:hidden"
              title="Close"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="space-y-1.5">
            {/* Step 1: Main Article */}
            <WorkflowItem
              label="Main article loaded"
              done={Boolean(state.main.text && state.main.text.length > 200)}
            />
            {/* Step 2: Structured Analysis */}
            <WorkflowItem
              label="Structured analysis"
              done={Boolean(state.main.structured)}
              cost={state.stepCosts?.structured}
            />
            {/* Step 3: Critical Review */}
            <WorkflowItem
              label="Critical review"
              done={Boolean(state.main.critique)}
              cost={state.stepCosts?.critique}
            />
            {/* Step 4: Related Articles */}
            <WorkflowItem
              label={`Related articles (${state.related.filter((r) => r.structured).length}/${state.related.length})`}
              done={
                state.related.length > 0 &&
                state.related.every((r) => r.structured)
              }
              partial={state.related.some((r) => r.structured)}
              cost={state.stepCosts?.relatedTotal}
            />
            {/* Step 5: Comparison */}
            <WorkflowItem
              label="Comparative analysis"
              done={Boolean(state.comparison)}
              disabled={state.related.length === 0}
              cost={state.stepCosts?.comparison}
            />
            {/* Step 6: Final Report */}
            <WorkflowItem
              label="Final report"
              done={Boolean(state.finalReportMarkdown)}
              cost={state.stepCosts?.final}
            />
          </div>
          {/* Total Cost - shown when final report is done */}
          {state.finalReportMarkdown && (
            <div className="mt-3 flex items-center justify-between border-t border-cyan-500/20 pt-3">
              <span className="text-xs font-semibold text-zinc-300">Total</span>
              <span className="text-sm font-bold text-emerald-400">
                €
                {(
                  (state.stepCosts?.structured ?? 0) +
                  (state.stepCosts?.critique ?? 0) +
                  (state.stepCosts?.relatedTotal ?? 0) +
                  (state.stepCosts?.comparison ?? 0) +
                  (state.stepCosts?.final ?? 0)
                ).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Error/Busy Messages */}
        {(error || busy) && (
          <div className="border-b border-cyan-500/20 p-3 space-y-2">
            {error && (
              <div className="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}
            {busy && (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-200">
                <span className="inline-block h-2 w-2 animate-spin rounded-full border border-zinc-400 border-t-transparent" />
                {busy}
              </div>
            )}
          </div>
        )}

        {/* Activity Log Header */}
        <div className="flex items-center justify-between border-b border-cyan-500/20 px-4 py-3">
          <span className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
            <span
              className={`inline-block h-2 w-2 rounded-full ${busy ? "animate-pulse bg-cyan-400" : "bg-zinc-600"}`}
            />
            AI Activity Log
          </span>
          {logMessages.length > 0 && !busy && (
            <button
              onClick={clearLog}
              className="text-xs text-cyan-400 hover:text-cyan-300"
            >
              Clear
            </button>
          )}
        </div>

        {/* Session Cost Summary */}
        {sessionCost.tokens > 0 && (
          <div className="border-b border-cyan-500/20 bg-zinc-900/50 px-4 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">Session total:</span>
              <div className="flex items-center gap-3">
                <span className="text-zinc-300">
                  {sessionCost.tokens.toLocaleString()} tokens
                </span>
                <span className="font-semibold text-emerald-400">
                  {formatCost(sessionCost.euros)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Log Messages */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 font-mono text-xs">
          {logMessages.length > 0 ? (
            <div className="space-y-1">
              {logMessages.map((msg, i) => (
                <div key={i} className="flex gap-2 text-zinc-300">
                  <span className="shrink-0 text-zinc-500">{msg.time}</span>
                  <span
                    className={`break-words ${
                      msg.text.startsWith("✓") || msg.text.startsWith("✅")
                        ? "text-green-400"
                        : msg.text.startsWith("✗") || msg.text.startsWith("❌")
                          ? "text-red-400"
                          : msg.text.startsWith("💰")
                            ? "text-emerald-400"
                            : msg.text.startsWith("📊") &&
                                msg.text.includes("Tokens:")
                              ? "text-cyan-300"
                              : ""
                    }`}
                  >
                    {msg.text}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-zinc-500">
              <svg
                className="mb-2 h-8 w-8 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span>No activity yet</span>
              <span className="mt-1 text-xs">Run an analysis to see logs</span>
            </div>
          )}
        </div>
      </div>

      <main className="relative mx-auto grid max-w-5xl gap-3 px-3 py-4 sm:gap-4 sm:px-6 sm:py-6 md:pr-[340px]">
        {/* Hero Branding */}
        <div className="flex flex-col items-center justify-center py-4 sm:py-8">
          <Image
            src="/rui.png"
            alt="RUI"
            width={160}
            height={160}
            priority
            className="h-24 w-auto sm:h-40"
          />
          <h1 className="mt-3 bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-center text-2xl font-bold tracking-tight text-transparent sm:mt-4 sm:text-4xl">
            Research Understanding Intelligence
          </h1>
          <p className="mt-1.5 text-center text-xs text-zinc-400 sm:mt-2 sm:text-sm">
            AI-assisted critical analysis workflow for academic research
          </p>

          {/* Simplified Workflow - hidden on mobile */}
          <div className="mt-6 hidden items-center justify-center gap-2 text-xs sm:mt-8 sm:flex">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <span className="text-zinc-400">Upload</span>
            </div>
            <div className="h-px w-6 bg-zinc-700" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              </div>
              <span className="text-zinc-400">Analyze</span>
            </div>
            <div className="h-px w-6 bg-zinc-700" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
              </div>
              <span className="text-zinc-400">Compare</span>
            </div>
            <div className="h-px w-6 bg-zinc-700" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <span className="text-zinc-400">Report</span>
            </div>
            <div className="h-px w-6 bg-zinc-700" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </div>
              <span className="text-zinc-400">Export</span>
            </div>
          </div>
        </div>

        <Card title="1) Settings">
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-zinc-300">
                Model provider
              </span>
              <select
                value={state.provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="openai">OpenAI (GPT-5.2)</option>
                <option value="gemini">Google Gemini (Gemini 3)</option>
              </select>
            </label>
            {process.env.NODE_ENV !== "production" && (
              <label className="grid gap-1">
                <span className="text-xs font-medium text-zinc-300">
                  Model name (dev only)
                </span>
                <input
                  value={state.model}
                  onChange={(e) =>
                    setState((s) => ({ ...s, model: e.target.value }))
                  }
                  className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  placeholder={
                    state.provider === "openai" ? "gpt-4o" : "gemini-2.0-flash"
                  }
                />
              </label>
            )}
          </div>
        </Card>

        <Card title="2) Main Article">
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 md:col-span-2">
                <span className="text-xs font-medium text-zinc-300">DOI</span>
                <input
                  value={state.main.doi ?? ""}
                  onChange={(e) => updateMain({ doi: e.target.value })}
                  className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  placeholder="10.xxxx/xxxx"
                />
              </label>
              <div className="grid items-end gap-2">
                <button
                  onClick={() =>
                    state.main.doi && lookupDoi(state.main.doi, "main")
                  }
                  className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
                  disabled={!state.main.doi}
                >
                  Lookup metadata
                </button>
                <a
                  href={
                    state.main.doi ? `https://doi.org/${state.main.doi}` : "#"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => !state.main.doi && e.preventDefault()}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 ${!state.main.doi ? "pointer-events-none opacity-50" : ""}`}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  Open Article
                </a>
              </div>
            </div>

            <div className="rounded-xl border-2 border-dashed border-white/20 bg-zinc-900/30 p-4 transition-colors hover:border-white/30 hover:bg-zinc-900/50">
              <label className="flex cursor-pointer flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
                  <svg
                    className="h-6 w-6 text-zinc-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium text-zinc-200">
                    {state.main.pdfName ? "Replace PDF" : "Upload PDF"}
                  </span>
                  <p className="mt-1 text-xs text-zinc-500">
                    Click to browse or drag and drop
                  </p>
                </div>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void parsePdfInto(f, "main");
                  }}
                  className="hidden"
                />
              </label>
              {state.main.pdfName && (
                <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-emerald-950/30 px-3 py-2 text-sm text-emerald-400">
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {state.main.pdfName}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTextModalOpen(true)}
                className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
              >
                {state.main.text
                  ? `View Extracted Text (${state.main.text.length.toLocaleString()} chars)`
                  : "View / Edit Extracted Text"}
              </button>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-white/20 bg-zinc-900/30 p-3">
              {/* Structured Analysis Row */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void runStructured("main")}
                  disabled={!state.main.text || state.main.text.length < 200}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
                >
                  Run Structured Analysis
                </button>
                {Boolean(state.main.structured) && (
                  <button
                    onClick={() => setStructuredModalOpen(true)}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/30"
                  >
                    View Structured Analysis ✓
                  </button>
                )}
                <span className="text-xs text-zinc-400">
                  {state.main.text && state.main.text.length >= 200
                    ? "Ready to analyze"
                    : "Upload PDF or paste text first"}
                </span>
              </div>
              {/* Critical Review Row */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void runCritique("main")}
                  disabled={!state.main.structured}
                  className="rounded-xl border border-white/10 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
                >
                  Run Critical Review
                </button>
                {Boolean(state.main.critique) && (
                  <button
                    onClick={() => setCritiqueModalOpen(true)}
                    className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-900/30"
                  >
                    View Critical Review ✓
                  </button>
                )}
                <span className="text-xs text-zinc-400">
                  {state.main.structured
                    ? "Run after structured analysis"
                    : "Requires structured analysis first"}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Extracted Text Modal */}
        <Modal
          open={textModalOpen}
          onClose={() => setTextModalOpen(false)}
          title="Extracted Content"
          onDownload={
            state.main.text
              ? () => {
                  const blob = new Blob([state.main.text ?? ""], {
                    type: "text/plain",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${state.main.title ?? "article"}-text.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              : undefined
          }
        >
          <ExtractedContentView
            pages={state.main.extractedPages}
            text={state.main.text}
            pdfName={state.main.pdfName}
            onTextChange={(text) => updateMain({ text })}
          />
        </Modal>

        {/* Structured Analysis Modal */}
        <Modal
          open={structuredModalOpen}
          onClose={() => setStructuredModalOpen(false)}
          title="Structured Analysis"
          onDownload={
            state.main.structured
              ? async () => {
                  await exportStructuredAnalysisToPdf(
                    state.main.structured as StructuredAnalysisData,
                    state.main.title,
                    `${state.main.title ?? "article"}-structured-analysis.pdf`,
                  );
                }
              : undefined
          }
        >
          {state.main.structured ? (
            <div className="space-y-4">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    const data = state.main
                      .structured as StructuredAnalysisData;
                    const text = [
                      `# ${data.title ?? state.main.title ?? "Structured Analysis"}`,
                      "",
                      data.shortSummary
                        ? `## Summary\n${data.shortSummary}`
                        : "",
                      "",
                      data.researchQuestion
                        ? `## Research Question\n${data.researchQuestion}`
                        : "",
                      "",
                      data.methodology
                        ? `## Methodology\n**Design:** ${data.methodology.design ?? "N/A"}\n**Data:** ${data.methodology.data ?? "N/A"}\n**Analysis:** ${data.methodology.analysis ?? "N/A"}`
                        : "",
                      "",
                      data.keyFindings?.length
                        ? `## Key Findings\n${data.keyFindings.map((f) => `- ${f}`).join("\n")}`
                        : "",
                      "",
                      data.contributions?.length
                        ? `## Contributions\n${data.contributions.map((c) => `- ${c}`).join("\n")}`
                        : "",
                      "",
                      data.limitations?.length
                        ? `## Limitations\n${data.limitations.map((l) => `- ${l}`).join("\n")}`
                        : "",
                      "",
                      data.futureWork?.length
                        ? `## Future Work\n${data.futureWork.map((f) => `- ${f}`).join("\n")}`
                        : "",
                      "",
                      data.keywords?.length
                        ? `**Keywords:** ${data.keywords.join(", ")}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join("\n");
                    navigator.clipboard.writeText(text);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy as Markdown
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob(
                      [JSON.stringify(state.main.structured, null, 2)],
                      { type: "application/json" },
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${state.main.title ?? "article"}-structured-analysis.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export JSON
                </button>
              </div>
              <div id="structured-analysis-content" className="bg-zinc-950 p-1">
                <StructuredAnalysisView
                  data={state.main.structured as StructuredAnalysisData}
                  articleTitle={state.main.title}
                />
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-zinc-400">
              Run structured analysis to see results here.
            </div>
          )}
        </Modal>

        {/* Critical Review Modal for Main Article */}
        <Modal
          open={critiqueModalOpen}
          onClose={() => setCritiqueModalOpen(false)}
          title="Critical Review"
          onDownload={
            state.main.critique
              ? () => {
                  const blob = new Blob(
                    [JSON.stringify(state.main.critique, null, 2)],
                    { type: "application/json" },
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${state.main.title ?? "article"}-critical-review.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              : undefined
          }
        >
          {state.main.critique ? (
            <div className="space-y-4">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      JSON.stringify(state.main.critique, null, 2),
                    );
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy JSON
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob(
                      [JSON.stringify(state.main.critique, null, 2)],
                      { type: "application/json" },
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${state.main.title ?? "article"}-critical-review.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export JSON
                </button>
              </div>
              <CriticalReviewView
                data={state.main.critique as CriticalReviewData}
                articleTitle={state.main.title}
              />
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-zinc-400">
              Run critical review to see results here.
            </div>
          )}
        </Modal>

        <Card
          title="3) Related Articles"
          right={
            state.mendeley?.accessToken ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-2 py-1 text-xs font-medium text-emerald-400">
                  <svg
                    className="h-3 w-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="hidden sm:inline">Mendeley</span>
                </span>
                <button
                  onClick={() => setState((s) => ({ ...s, mendeley: {} }))}
                  className="rounded-lg border border-red-500/30 bg-red-950/30 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-900/30"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectMendeley}
                className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
              >
                Connect Mendeley
              </button>
            )
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={addRelated}
              className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-zinc-200"
            >
              Add related article
            </button>
            <MendeleyLibraryBrowser
              enabled={Boolean(state.mendeley?.accessToken)}
              onFetchLibrary={fetchMendeleyLibrary}
              onAdd={(doc) =>
                setState((s) => ({
                  ...s,
                  related: [
                    ...s.related,
                    {
                      id: newId(),
                      title: doc.title,
                      doi: doc.doi,
                      authors: doc.authors,
                      year: doc.year,
                    },
                  ],
                }))
              }
              onError={(msg) => setError(msg)}
            />
            <MendeleyQuickSearch
              enabled={Boolean(state.mendeley?.accessToken)}
              onSearch={searchMendeley}
              onAdd={(doc) =>
                setState((s) => ({
                  ...s,
                  related: [
                    ...s.related,
                    {
                      id: newId(),
                      title: doc.title,
                      doi: doc.doi,
                      authors: doc.authors,
                      year: doc.year,
                    },
                  ],
                }))
              }
              onError={(msg) => setError(msg)}
            />
          </div>

          <div className="mt-4 grid gap-3">
            {state.related.length === 0 ? (
              <div className="text-sm text-zinc-300">
                Add related articles manually or via Mendeley search.
              </div>
            ) : null}
            {state.related.map((a) => (
              <div
                key={a.id}
                className="rounded-2xl border border-white/10 bg-zinc-950/60 overflow-hidden"
              >
                <button
                  onClick={() => toggleRelatedExpanded(a.id)}
                  className="flex w-full items-center justify-between gap-2 p-4 text-left hover:bg-zinc-900/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <svg
                      className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${expandedRelated.has(a.id) ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-50">
                        {a.title ?? "Untitled related article"}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-zinc-300">
                        {a.doi ? <span>DOI: {a.doi}</span> : null}
                        {a.year ? <span>{a.year}</span> : null}
                        {a.authors?.length ? (
                          <span>{a.authors.slice(0, 3).join(", ")}</span>
                        ) : null}
                        {a.pdfName ? (
                          <span className="text-emerald-400">✓ PDF</span>
                        ) : null}
                        {a.structured ? (
                          <span className="text-emerald-400">✓ Analyzed</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRelated(a.id);
                      }}
                      className="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-900/40 cursor-pointer"
                    >
                      Delete
                    </span>
                  </div>
                </button>

                {expandedRelated.has(a.id) && (
                  <div className="border-t border-white/10 p-4 grid gap-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="grid gap-1 md:col-span-2">
                        <span className="text-xs font-medium text-zinc-300">
                          DOI
                        </span>
                        <input
                          value={a.doi ?? ""}
                          onChange={(e) =>
                            updateRelated(a.id, { doi: e.target.value })
                          }
                          className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                          placeholder="10.xxxx/xxxx"
                        />
                      </label>
                      <div className="grid items-end gap-2">
                        <button
                          onClick={() => a.doi && lookupDoi(a.doi, a.id)}
                          disabled={!a.doi}
                          className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
                        >
                          Lookup metadata
                        </button>
                        <a
                          href={a.doi ? `https://doi.org/${a.doi}` : "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => !a.doi && e.preventDefault()}
                          className={`flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800 ${!a.doi ? "pointer-events-none opacity-50" : ""}`}
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                          Open Article
                        </a>
                      </div>
                    </div>

                    <div className="rounded-xl border-2 border-dashed border-white/20 bg-zinc-900/30 p-4 transition-colors hover:border-white/30 hover:bg-zinc-900/50">
                      <label className="flex cursor-pointer flex-col items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800">
                          <svg
                            className="h-5 w-5 text-zinc-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                        </div>
                        <div className="text-center">
                          <span className="text-sm font-medium text-zinc-200">
                            {a.pdfName ? "Replace PDF" : "Upload PDF"}
                          </span>
                          <p className="mt-1 text-xs text-zinc-500">
                            Click to browse
                          </p>
                        </div>
                        <input
                          type="file"
                          accept="application/pdf"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void parsePdfInto(f, a.id);
                          }}
                          className="hidden"
                        />
                      </label>
                      {a.pdfName && (
                        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-emerald-950/30 px-3 py-2 text-sm text-emerald-400">
                          <svg
                            className="h-4 w-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {a.pdfName}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setRelatedTextModalId(a.id)}
                        className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
                      >
                        {a.text
                          ? `View Extracted Text (${a.text.length.toLocaleString()} chars)`
                          : "View / Edit Extracted Text"}
                      </button>
                    </div>

                    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-white/20 bg-zinc-900/30 p-3">
                      {/* Structured Analysis Row */}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => void runStructured(a.id)}
                          disabled={!a.text || a.text.length < 200}
                          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
                        >
                          Run Structured Analysis
                        </button>
                        {Boolean(a.structured) && (
                          <button
                            onClick={() => setRelatedStructuredModalId(a.id)}
                            className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/30"
                          >
                            View Structured Analysis ✓
                          </button>
                        )}
                        <span className="text-xs text-zinc-400">
                          {a.text && a.text.length >= 200
                            ? "Ready to analyze"
                            : "Upload PDF or paste text first"}
                        </span>
                      </div>
                      {/* Critical Review Row */}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => void runCritique(a.id)}
                          disabled={!a.structured}
                          className="rounded-xl border border-white/10 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
                        >
                          Run Critical Review
                        </button>
                        {Boolean(a.critique) && (
                          <button
                            onClick={() => setRelatedCritiqueModalId(a.id)}
                            className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-900/30"
                          >
                            View Critical Review ✓
                          </button>
                        )}
                        <span className="text-xs text-zinc-400">
                          {a.structured
                            ? "Run after structured analysis"
                            : "Requires structured analysis first"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Related Article Extracted Text Modals */}
        {state.related.map((a) => (
          <Modal
            key={`text-modal-${a.id}`}
            open={relatedTextModalId === a.id}
            onClose={() => setRelatedTextModalId(null)}
            title={`Extracted Content - ${a.title ?? "Related Article"}`}
            onDownload={
              a.text
                ? () => {
                    const blob = new Blob([a.text ?? ""], {
                      type: "text/plain",
                    });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = `${a.title ?? "article"}-text.txt`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                  }
                : undefined
            }
          >
            <ExtractedContentView
              pages={a.extractedPages}
              text={a.text}
              pdfName={a.pdfName}
              onTextChange={(text) => updateRelated(a.id, { text })}
            />
          </Modal>
        ))}

        {/* Related Article Structured Analysis Modals */}
        {state.related.map((a) => (
          <Modal
            key={`structured-modal-${a.id}`}
            open={relatedStructuredModalId === a.id}
            onClose={() => setRelatedStructuredModalId(null)}
            title={`Structured Analysis - ${a.title ?? "Related Article"}`}
            onDownload={
              a.structured
                ? async () => {
                    await exportStructuredAnalysisToPdf(
                      a.structured as StructuredAnalysisData,
                      a.title,
                      `${a.title ?? "article"}-structured-analysis.pdf`,
                    );
                  }
                : undefined
            }
          >
            {a.structured ? (
              <div className="space-y-4">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      const data = a.structured as StructuredAnalysisData;
                      const text = [
                        `# ${data.title ?? a.title ?? "Structured Analysis"}`,
                        "",
                        data.shortSummary
                          ? `## Summary\n${data.shortSummary}`
                          : "",
                        "",
                        data.researchQuestion
                          ? `## Research Question\n${data.researchQuestion}`
                          : "",
                        "",
                        data.methodology
                          ? `## Methodology\n**Design:** ${data.methodology.design ?? "N/A"}\n**Data:** ${data.methodology.data ?? "N/A"}\n**Analysis:** ${data.methodology.analysis ?? "N/A"}`
                          : "",
                        "",
                        data.keyFindings?.length
                          ? `## Key Findings\n${data.keyFindings.map((f) => `- ${f}`).join("\n")}`
                          : "",
                        "",
                        data.contributions?.length
                          ? `## Contributions\n${data.contributions.map((c) => `- ${c}`).join("\n")}`
                          : "",
                        "",
                        data.limitations?.length
                          ? `## Limitations\n${data.limitations.map((l) => `- ${l}`).join("\n")}`
                          : "",
                        "",
                        data.futureWork?.length
                          ? `## Future Work\n${data.futureWork.map((f) => `- ${f}`).join("\n")}`
                          : "",
                        "",
                        data.keywords?.length
                          ? `**Keywords:** ${data.keywords.join(", ")}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join("\n");
                      navigator.clipboard.writeText(text);
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    Copy as Markdown
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob(
                        [JSON.stringify(a.structured, null, 2)],
                        { type: "application/json" },
                      );
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = `${a.title ?? "article"}-structured-analysis.json`;
                      anchor.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Export JSON
                  </button>
                </div>
                <div
                  id={`structured-analysis-content-${a.id}`}
                  className="bg-zinc-950 p-1"
                >
                  <StructuredAnalysisView
                    data={a.structured as StructuredAnalysisData}
                    articleTitle={a.title}
                  />
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-zinc-400">
                Run structured analysis to see results here.
              </div>
            )}
          </Modal>
        ))}

        {/* Related Article Critical Review Modals */}
        {state.related.map((a) => (
          <Modal
            key={`critique-modal-${a.id}`}
            open={relatedCritiqueModalId === a.id}
            onClose={() => setRelatedCritiqueModalId(null)}
            title={`Critical Review - ${a.title ?? "Related Article"}`}
            onDownload={
              a.critique
                ? () => {
                    const blob = new Blob(
                      [JSON.stringify(a.critique, null, 2)],
                      { type: "application/json" },
                    );
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = `${a.title ?? "article"}-critical-review.json`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                  }
                : undefined
            }
          >
            {a.critique ? (
              <div className="space-y-4">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        JSON.stringify(a.critique, null, 2),
                      );
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    Copy JSON
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob(
                        [JSON.stringify(a.critique, null, 2)],
                        { type: "application/json" },
                      );
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = `${a.title ?? "article"}-critical-review.json`;
                      anchor.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Export JSON
                  </button>
                </div>
                <CriticalReviewView
                  data={a.critique as CriticalReviewData}
                  articleTitle={a.title}
                />
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-zinc-400">
                Run critical review to see results here.
              </div>
            )}
          </Modal>
        ))}

        <Card
          title="4) Comparative Analysis"
          right={
            <div className="flex items-center gap-2">
              {!!state.comparison && (
                <button
                  onClick={() => setComparisonModalOpen(true)}
                  className="rounded-xl border border-purple-500/30 bg-purple-950/30 px-3 py-2 text-sm font-medium text-purple-300 hover:bg-purple-900/30"
                >
                  View Comparison ✓
                </button>
              )}
              <button
                onClick={() => void runCompare()}
                className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-zinc-200"
              >
                {state.comparison ? "Re-compare" : "Compare"}
              </button>
            </div>
          }
        >
          {state.comparison ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Comparative analysis complete
              </div>
              <p className="text-sm text-zinc-400">
                {(state.comparison as ComparativeAnalysisData).summary?.slice(
                  0,
                  200,
                )}
                ...
              </p>
              <button
                onClick={() => setComparisonModalOpen(true)}
                className="text-sm text-purple-400 hover:text-purple-300"
              >
                View full comparison →
              </button>
            </div>
          ) : (
            <div className="text-sm text-zinc-300">
              Run comparison after analyzing at least one related paper.
            </div>
          )}
        </Card>

        {/* Comparison Modal */}
        <Modal
          open={comparisonModalOpen}
          onClose={() => setComparisonModalOpen(false)}
          title="Comparative Analysis"
          onDownload={
            state.comparison
              ? () => {
                  const blob = new Blob(
                    [JSON.stringify(state.comparison, null, 2)],
                    { type: "application/json" },
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "comparative-analysis.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }
              : undefined
          }
        >
          {state.comparison ? (
            <div className="space-y-4">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    const data = state.comparison as ComparativeAnalysisData;
                    const text = [
                      "# Comparative Analysis",
                      "",
                      data.summary ? `## Summary\n${data.summary}` : "",
                      "",
                      data.similarities?.length
                        ? `## Similarities\n${data.similarities.map((s) => `- ${s}`).join("\n")}`
                        : "",
                      "",
                      data.differences?.length
                        ? `## Differences\n${data.differences.map((d) => `- ${d}`).join("\n")}`
                        : "",
                      "",
                      data.comparisonDimensions?.length
                        ? `## Detailed Comparison\n${data.comparisonDimensions.map((dim) => `### ${dim.dimension}\n**Main:** ${dim.main}\n${dim.related.map((r) => `**${r.id}:** ${r.notes}`).join("\n")}`).join("\n\n")}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join("\n");
                    navigator.clipboard.writeText(text);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy as Markdown
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob(
                      [JSON.stringify(state.comparison, null, 2)],
                      { type: "application/json" },
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "comparative-analysis.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export JSON
                </button>
              </div>
              <ComparativeAnalysisView
                data={state.comparison as ComparativeAnalysisData}
                mainTitle={state.main.title}
                relatedTitles={Object.fromEntries(
                  state.related.map((r) => [r.id, r.title ?? "Untitled"]),
                )}
              />
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-zinc-400">
              Run comparative analysis to see results here.
            </div>
          )}
        </Modal>

        <Card
          title="5) Final Critical Analysis"
          right={
            <div className="flex items-center gap-2">
              {state.finalReportMarkdown && (
                <button
                  onClick={() => setFinalReportModalOpen(true)}
                  className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/30"
                >
                  View Report ✓
                </button>
              )}
              <button
                onClick={() => void runFinal()}
                className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-zinc-200"
              >
                {state.finalReportMarkdown ? "Regenerate" : "Generate"}
              </button>
            </div>
          }
        >
          <div className="grid gap-4">
            {/* Structure Mode Selection */}
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-200">
                <input
                  type="radio"
                  name="structure"
                  checked={state.structureMode === "recommended"}
                  onChange={() =>
                    setState((s) => ({ ...s, structureMode: "recommended" }))
                  }
                  className="accent-emerald-500"
                />
                Predefined
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-200">
                <input
                  type="radio"
                  name="structure"
                  checked={state.structureMode === "custom"}
                  onChange={() =>
                    setState((s) => ({
                      ...s,
                      structureMode: "custom",
                      // Auto-populate with recommended sections if empty
                      customSections:
                        s.customSections && s.customSections.length > 0
                          ? s.customSections
                          : DEFAULT_SECTIONS.map((sec) => ({
                              ...sec,
                              id: newId(),
                            })),
                    }))
                  }
                  className="accent-emerald-500"
                />
                Custom
              </label>
            </div>

            {/* Report Settings */}
            <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3">
              <div className="mb-2 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Report Settings
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={state.reportSettings?.useAPA7 ?? true}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        reportSettings: {
                          ...s.reportSettings,
                          useAPA7: e.target.checked,
                        },
                      }))
                    }
                    className="accent-emerald-500"
                  />
                  APA 7th Edition References
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={state.reportSettings?.includeCitations ?? true}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        reportSettings: {
                          ...s.reportSettings,
                          includeCitations: e.target.checked,
                        },
                      }))
                    }
                    className="accent-emerald-500"
                  />
                  Include In-text Citations
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-400">Length:</span>
                  <select
                    value={state.reportSettings?.reportLength ?? "standard"}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        reportSettings: {
                          ...s.reportSettings,
                          reportLength: e.target.value as
                            | "concise"
                            | "standard"
                            | "detailed",
                        },
                      }))
                    }
                    className="rounded-lg border border-white/10 bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
                  >
                    <option value="concise">Concise (~1000 words)</option>
                    <option value="standard">Standard (~2000 words)</option>
                    <option value="detailed">Detailed (~4000 words)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Custom Sections Editor */}
            {state.structureMode === "custom" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300">
                    Custom Sections ({state.customSections?.length ?? 0})
                  </span>
                  <button
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        customSections: [
                          ...(s.customSections ?? []),
                          {
                            id: newId(),
                            title: `Section ${(s.customSections?.length ?? 0) + 1}`,
                            notes: "",
                          },
                        ],
                      }))
                    }
                    className="flex items-center gap-1 rounded-lg bg-emerald-900/50 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-800/50"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    Add Section
                  </button>
                </div>
                <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-white/5 bg-zinc-950/50 p-2">
                  {(state.customSections ?? []).map((section, idx) => (
                    <div
                      key={section.id}
                      className="group rounded-lg border border-white/10 bg-zinc-900/80 p-2"
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-1.5 text-xs font-medium text-zinc-500">
                          {idx + 1}.
                        </span>
                        <div className="flex-1 space-y-2">
                          <input
                            value={section.title}
                            onChange={(e) =>
                              setState((s) => ({
                                ...s,
                                customSections: s.customSections.map((sec) =>
                                  sec.id === section.id
                                    ? { ...sec, title: e.target.value }
                                    : sec,
                                ),
                              }))
                            }
                            placeholder="Section title..."
                            className="w-full rounded-lg border border-white/10 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500"
                          />
                          <textarea
                            value={section.notes}
                            onChange={(e) =>
                              setState((s) => ({
                                ...s,
                                customSections: s.customSections.map((sec) =>
                                  sec.id === section.id
                                    ? { ...sec, notes: e.target.value }
                                    : sec,
                                ),
                              }))
                            }
                            placeholder="Notes for AI: How should this section be written? What to include/exclude?"
                            rows={2}
                            className="w-full rounded-lg border border-white/10 bg-zinc-800/50 px-2 py-1.5 text-xs text-zinc-300 placeholder:text-zinc-600"
                          />
                          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <input
                              type="checkbox"
                              checked={section.includeCitations ?? true}
                              onChange={(e) =>
                                setState((s) => ({
                                  ...s,
                                  customSections: s.customSections.map((sec) =>
                                    sec.id === section.id
                                      ? {
                                          ...sec,
                                          includeCitations: e.target.checked,
                                        }
                                      : sec,
                                  ),
                                }))
                              }
                              className="accent-emerald-500"
                            />
                            Include citations
                          </label>
                        </div>
                        <div className="flex flex-col gap-1">
                          {idx > 0 && (
                            <button
                              onClick={() =>
                                setState((s) => {
                                  const sections = [...s.customSections];
                                  [sections[idx - 1], sections[idx]] = [
                                    sections[idx],
                                    sections[idx - 1],
                                  ];
                                  return { ...s, customSections: sections };
                                })
                              }
                              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                              title="Move up"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 15l7-7 7 7"
                                />
                              </svg>
                            </button>
                          )}
                          {idx < (state.customSections?.length ?? 0) - 1 && (
                            <button
                              onClick={() =>
                                setState((s) => {
                                  const sections = [...s.customSections];
                                  [sections[idx], sections[idx + 1]] = [
                                    sections[idx + 1],
                                    sections[idx],
                                  ];
                                  return { ...s, customSections: sections };
                                })
                              }
                              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                              title="Move down"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setState((s) => ({
                                ...s,
                                customSections: s.customSections.filter(
                                  (sec) => sec.id !== section.id,
                                ),
                              }))
                            }
                            className="rounded p-1 text-zinc-500 hover:bg-red-900/30 hover:text-red-400"
                            title="Remove section"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(state.customSections?.length ?? 0) === 0 && (
                    <div className="py-4 text-center text-xs text-zinc-500">
                      No sections yet. Click &quot;Add Section&quot; to start.
                    </div>
                  )}
                </div>
                <button
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      customSections: DEFAULT_SECTIONS.map((sec) => ({
                        ...sec,
                        id: newId(),
                      })),
                    }))
                  }
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Reset to predefined sections
                </button>
              </div>
            ) : (
              <div className="text-xs text-zinc-400">
                Using predefined structure ({RECOMMENDED_STRUCTURE.length}{" "}
                sections). Switch to Custom to customize sections and add notes.
              </div>
            )}

            {/* Status */}
            {state.finalReportMarkdown ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Final report generated (
                  {state.finalReportMarkdown.split(/\s+/).length} words)
                </div>
                <button
                  onClick={() => setFinalReportModalOpen(true)}
                  className="text-sm text-emerald-400 hover:text-emerald-300"
                >
                  View full report →
                </button>
              </div>
            ) : (
              <div className="text-sm text-zinc-400">
                Configure settings and structure above, then generate your final
                critical analysis report.
              </div>
            )}
          </div>
        </Card>

        {/* Final Report Modal */}
        <Modal
          open={finalReportModalOpen}
          onClose={() => setFinalReportModalOpen(false)}
          title="Final Critical Analysis"
          onDownload={
            state.finalReportMarkdown
              ? async () => {
                  try {
                    const modalReport = document.getElementById(
                      "modal-report-content",
                    );
                    if (modalReport) {
                      await exportElementToPdf(
                        modalReport,
                        "rui-critical-analysis.pdf",
                      );
                    } else {
                      console.error("Modal report content element not found");
                    }
                  } catch (err) {
                    console.error("PDF export failed:", err);
                  }
                }
              : undefined
          }
        >
          {state.finalReportMarkdown ? (
            <div className="space-y-4">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    if (state.finalReportMarkdown) {
                      navigator.clipboard.writeText(state.finalReportMarkdown);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy Markdown
                </button>
                <button
                  onClick={() => {
                    if (!state.finalReportMarkdown) return;
                    const blob = new Blob([state.finalReportMarkdown], {
                      type: "text/markdown",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "critical-analysis.md";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export .md
                </button>
                <button
                  onClick={async () => {
                    try {
                      const modalReport = document.getElementById(
                        "modal-report-content",
                      );
                      if (modalReport) {
                        await exportElementToPdf(
                          modalReport,
                          "rui-critical-analysis.pdf",
                        );
                      } else {
                        console.error("Modal report content element not found");
                      }
                    } catch (err) {
                      console.error("PDF export failed:", err);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-700"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  Export PDF
                </button>
              </div>
              <div
                id="modal-report-content"
                ref={(el) => {
                  reportRef.current = el;
                }}
                className="prose prose-invert prose-zinc max-w-none rounded-2xl border border-white/10 bg-zinc-950/60 p-6"
              >
                <div dangerouslySetInnerHTML={{ __html: reportHtml }} />
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-zinc-400">
              Generate a final report to see it here.
            </div>
          )}
        </Modal>

        {/* Support link */}
        <footer className="mt-16 border-t border-white/10 py-6 text-center">
          <p className="text-sm text-zinc-400">
            If this was helpful and you&apos;d like to support the project →{" "}
            <a
              href="https://buymeacoffee.com/maybe3"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 hover:underline"
            >
              ☕ Buy me a coffee
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

function MendeleyQuickSearch({
  enabled,
  onSearch,
  onAdd,
  onError,
}: {
  enabled: boolean;
  onSearch: (query: string) => Promise<MendeleyDoc[]>;
  onAdd: (doc: MendeleyDoc) => void;
  onError: (msg: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<MendeleyDoc[] | null>(null);

  const run = async () => {
    try {
      const r = await onSearch(q);
      setResults(r);
    } catch (e: unknown) {
      onError(errorMessage(e));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-[320px] rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        placeholder={
          enabled
            ? "Search Mendeley (keywords or DOI)…"
            : "Connect Mendeley to search…"
        }
        disabled={!enabled}
      />
      <button
        onClick={() => void run()}
        disabled={!enabled || !q.trim()}
        className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
      >
        Search
      </button>
      {results?.length ? (
        <div className="w-full rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
          <div className="mb-2 text-xs font-semibold text-zinc-200">
            Results
          </div>
          <div className="grid gap-2">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => onAdd(r)}
                className="rounded-xl border border-white/10 bg-zinc-900/60 p-3 text-left hover:bg-zinc-900"
              >
                <div className="text-sm font-semibold text-zinc-50">
                  {r.title ?? "Untitled"}
                </div>
                <div className="mt-0.5 text-xs text-zinc-300">
                  {r.doi ? `DOI: ${r.doi} • ` : ""}
                  {r.year ? `${r.year} • ` : ""}
                  {Array.isArray(r.authors) && r.authors.length
                    ? r.authors.slice(0, 4).join(", ")
                    : ""}
                </div>
                <div className="mt-1 text-xs text-zinc-400">Click to add</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MendeleyLibraryBrowser({
  enabled,
  onFetchLibrary,
  onAdd,
  onError,
}: {
  enabled: boolean;
  onFetchLibrary: (offset?: number) => Promise<{
    results: MendeleyLibraryDoc[];
    hasMore: boolean;
    totalCount?: number;
  }>;
  onAdd: (doc: MendeleyLibraryDoc) => void;
  onError: (msg: string) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [docs, setDocs] = React.useState<MendeleyLibraryDoc[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [totalCount, setTotalCount] = React.useState<number | undefined>();
  const [searchFilter, setSearchFilter] = React.useState("");

  const loadLibrary = async (append = false) => {
    setLoading(true);
    try {
      const offset = append ? docs.length : 0;
      const result = await onFetchLibrary(offset);
      setDocs(append ? [...docs, ...result.results] : result.results);
      setHasMore(result.hasMore);
      if (result.totalCount !== undefined) setTotalCount(result.totalCount);
    } catch (e: unknown) {
      onError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const openLibrary = async () => {
    setIsOpen(true);
    if (docs.length === 0) {
      await loadLibrary();
    }
  };

  const filteredDocs = searchFilter.trim()
    ? docs.filter((d) => {
        const q = searchFilter.toLowerCase();
        return (
          d.title?.toLowerCase().includes(q) ||
          d.authors?.some((a) => a.toLowerCase().includes(q)) ||
          d.doi?.toLowerCase().includes(q) ||
          d.abstract?.toLowerCase().includes(q)
        );
      })
    : docs;

  if (!enabled) return null;

  return (
    <>
      <button
        onClick={() => void openLibrary()}
        className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-900/30"
      >
        📚 My Library
      </button>

      {isOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-50">
                    My Mendeley Library
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {totalCount !== undefined
                      ? `${totalCount} articles in your library`
                      : `${docs.length} articles loaded`}
                  </p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Search filter */}
              <div className="border-b border-white/10 px-5 py-3">
                <input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-zinc-100"
                  placeholder="Filter by title, author, DOI, or abstract..."
                />
              </div>

              {/* Library list */}
              <div className="flex-1 overflow-y-auto p-4">
                {loading && docs.length === 0 ? (
                  <div className="py-12 text-center text-zinc-400">
                    Loading your library...
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <div className="py-12 text-center text-zinc-400">
                    {searchFilter
                      ? "No articles match your filter"
                      : "Your library is empty"}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredDocs.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => {
                          onAdd(doc);
                          setIsOpen(false);
                        }}
                        className="w-full rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-left transition hover:border-cyan-500/30 hover:bg-zinc-900"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-zinc-50">
                              {doc.title ?? "Untitled"}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                              {doc.year && <span>{doc.year}</span>}
                              {doc.authors?.length > 0 && (
                                <span className="truncate">
                                  {doc.authors.slice(0, 3).join(", ")}
                                  {doc.authors.length > 3 && " et al."}
                                </span>
                              )}
                              {doc.sourceName && (
                                <span className="italic">{doc.sourceName}</span>
                              )}
                            </div>
                            {doc.doi && (
                              <div className="mt-1 text-xs text-zinc-500">
                                DOI: {doc.doi}
                              </div>
                            )}
                            {doc.abstract && (
                              <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                                {doc.abstract}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {doc.fileAttached && (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                PDF
                              </span>
                            )}
                            {doc.type && (
                              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                                {doc.type}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 text-[10px] text-cyan-400">
                          Click to add as related article
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Load more */}
                {hasMore && !searchFilter && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => void loadLibrary(true)}
                      disabled={loading}
                      className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {loading ? "Loading..." : "Load more"}
                    </button>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
                <span className="text-xs text-zinc-500">
                  Showing {filteredDocs.length} of {docs.length} loaded
                </span>
                <button
                  onClick={() => void loadLibrary()}
                  disabled={loading}
                  className="text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

type MendeleyDoc = {
  id: string;
  title?: string;
  doi?: string;
  year?: number;
  authors: string[];
  type?: string;
  source: "mendeley";
};

type MendeleyLibraryDoc = MendeleyDoc & {
  abstract?: string;
  sourceName?: string;
  created?: string;
  lastModified?: string;
  fileAttached?: boolean;
};
