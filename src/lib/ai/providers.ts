import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type Provider = "openai" | "gemini";

export type RunModelArgs = {
  provider: Provider;
  model: string;
  system: string;
  user: string;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
};

export type RunModelResult = {
  text: string;
  usage: TokenUsage;
};

export async function runModel({
  provider,
  model,
  system,
  user,
}: RunModelArgs): Promise<RunModelResult> {
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    const client = new OpenAI({ apiKey });
    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const outputText = resp.output
      ?.flatMap((o) => (o.type === "message" ? o.content : []))
      .map((c) => (c.type === "output_text" ? c.text : ""))
      .join("\n")
      .trim();

    if (!outputText) {
      throw new Error("OpenAI response had no text output");
    }

    const usage: TokenUsage = {
      inputTokens: resp.usage?.input_tokens ?? 0,
      outputTokens: resp.usage?.output_tokens ?? 0,
      cachedInputTokens: resp.usage?.input_tokens_details?.cached_tokens ?? 0,
    };

    return { text: outputText, usage };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model });
  const result = await geminiModel.generateContent([
    { text: `${system}\n\n${user}` },
  ]);
  const text = result.response.text();
  if (!text) throw new Error("Gemini response had no text");

  const usageMetadata = result.response.usageMetadata;
  const usage: TokenUsage = {
    inputTokens: usageMetadata?.promptTokenCount ?? 0,
    outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
    cachedInputTokens: usageMetadata?.cachedContentTokenCount ?? 0,
  };

  return { text, usage };
}
