"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";

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

export function CallbackClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = React.useState(
    "Finishing Mendeley authorization…",
  );
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    const expectedState = localStorage.getItem("rui.mendeley.state");

    if (!code) {
      setError("Missing authorization code.");
      return;
    }
    if (!state || !expectedState || state !== expectedState) {
      setError("State mismatch. Please try connecting again.");
      return;
    }

    (async () => {
      try {
        setStatus("Exchanging code for token…");
        const token = await postJson<unknown>("/api/mendeley/exchange", {
          code,
        });
        const t = (token ?? {}) as { [k: string]: unknown };
        const accessToken =
          typeof t.access_token === "string" ? t.access_token : undefined;
        const expiresIn =
          typeof t.expires_in === "number" ? t.expires_in : undefined;
        if (!accessToken) throw new Error("No access_token returned");

        const raw = localStorage.getItem("rui.state.v1");
        const current = raw ? JSON.parse(raw) : {};
        const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : undefined;
        const next = {
          ...current,
          mendeley: {
            ...(current?.mendeley ?? {}),
            accessToken,
            expiresAt,
          },
        };
        localStorage.setItem("rui.state.v1", JSON.stringify(next));

        setStatus("Connected. Redirecting…");
        router.replace("/");
      } catch (e: unknown) {
        setError(
          e && typeof e === "object" && "message" in e
            ? String((e as { message?: unknown }).message)
            : "Failed to complete authorization",
        );
      }
    })();
  }, [params, router]);

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-xl rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="text-base font-semibold text-black">
          Mendeley Callback
        </div>
        {error ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <div className="mt-3 text-sm text-zinc-700">{status}</div>
        )}
      </div>
    </div>
  );
}
