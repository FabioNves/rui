import { NextResponse } from "next/server";
import { extractFirstJsonObject } from "@/lib/ai/json";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function getErrorMessage(err: unknown) {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "Request failed";
}

export function requireJsonObject(text: string): unknown {
  const obj = extractFirstJsonObject(text);
  if (!obj || typeof obj !== "object") {
    throw new Error("Model did not return a valid JSON object");
  }
  return obj;
}
