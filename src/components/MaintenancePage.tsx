"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Montserrat } from "next/font/google";
import Lottie from "lottie-react";
import maintenanceAnimation from "../../assets/maintenance.json";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const SECRET_CODE = process.env.NEXT_PUBLIC_MAINTENANCE_SECRET_CODE || "";
const MAX_ATTEMPTS = 3;

declare global {
  interface Window {
    VANTA: {
      GLOBE: (config: Record<string, unknown>) => { destroy: () => void };
    };
    THREE: unknown;
  }
}

export default function MaintenancePage() {
  const vantaRef = useRef<HTMLDivElement>(null);
  const vantaEffect = useRef<{ destroy: () => void } | null>(null);
  const [code, setCode] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    return () => {
      if (vantaEffect.current) {
        vantaEffect.current.destroy();
      }
    };
  }, []);

  const initVanta = () => {
    if (vantaRef.current && window.VANTA && !vantaEffect.current) {
      vantaEffect.current = window.VANTA.GLOBE({
        el: vantaRef.current,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 1.0,
        scaleMobile: 1.0,
        color: 0x3fafff,
        color2: 0x8cecff,
        size: 0.9,
        backgroundColor: 0x1a044a,
      });
    }
  };

  const handleKeyPress = (digit: string) => {
    if (locked) return;

    setError(false);
    const newCode = code + digit;
    setCode(newCode);

    if (newCode.length === SECRET_CODE.length) {
      if (newCode === SECRET_CODE) {
        // Correct code - set bypass in sessionStorage and reload
        sessionStorage.setItem("rui_maintenance_bypass", "true");
        window.location.reload();
      } else {
        // Wrong code
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setError(true);
        setCode("");

        if (newAttempts >= MAX_ATTEMPTS) {
          setLocked(true);
        }
      }
    }
  };

  const handleDelete = () => {
    if (locked) return;
    setCode(code.slice(0, -1));
    setError(false);
  };

  const handleClear = () => {
    if (locked) return;
    setCode("");
    setError(false);
  };

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"
        strategy="beforeInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/vanta@0.5.24/dist/vanta.globe.min.js"
        strategy="afterInteractive"
        onLoad={initVanta}
      />
      <div
        ref={vantaRef}
        className={`min-h-screen w-full ${montserrat.className}`}
      >
        <div className="min-h-screen flex flex-col items-center justify-center p-6">
          <div className="max-w-lg w-full flex flex-col items-center text-center">
            {/* Lottie Animation */}
            <div className="w-full max-w-xs mb-4">
              <Lottie
                animationData={maintenanceAnimation}
                loop={true}
                autoplay={true}
                style={{ width: "100%", height: "auto" }}
              />
            </div>

            {/* Message - larger and bold, above */}
            <h1 className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-center text-3xl font-bold text-transparent sm:text-5xl">
              We&apos;re working on an improved version.
            </h1>

            {/* Title with gradient - smaller, below */}
            <h2 className="mt-3 bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-center text-sm font-medium tracking-tight text-transparent sm:text-base">
              Research Understanding Intelligence
            </h2>

            {/* Special Pass Section */}
            <div className="mt-10 flex flex-col items-center">
              <p className="text-zinc-400 text-sm mb-4">
                Do you have a Special pass? Insert code.
              </p>

              {/* Code Display */}
              <div className="flex gap-2 mb-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-10 h-12 rounded-lg border-2 flex items-center justify-center text-xl font-bold ${
                      error
                        ? "border-red-500 bg-red-500/10"
                        : code[i]
                          ? "border-white/40 bg-white/10"
                          : "border-zinc-600 bg-zinc-800/50"
                    }`}
                  >
                    {code[i] ? "•" : ""}
                  </div>
                ))}
              </div>

              {/* Error / Locked Message */}
              {locked ? (
                <p className="text-red-400 text-xs mb-3">
                  Too many attempts. Please try again later.
                </p>
              ) : error ? (
                <p className="text-red-400 text-xs mb-3">
                  Wrong code. {MAX_ATTEMPTS - attempts} attempt
                  {MAX_ATTEMPTS - attempts !== 1 ? "s" : ""} left.
                </p>
              ) : (
                <div className="h-5 mb-3" />
              )}

              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  "1",
                  "2",
                  "3",
                  "4",
                  "5",
                  "6",
                  "7",
                  "8",
                  "9",
                  "C",
                  "0",
                  "⌫",
                ].map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (key === "⌫") handleDelete();
                      else if (key === "C") handleClear();
                      else handleKeyPress(key);
                    }}
                    disabled={locked}
                    className={`w-14 h-14 rounded-xl text-xl font-semibold transition-all ${
                      locked
                        ? "bg-zinc-800/30 text-zinc-600 cursor-not-allowed"
                        : key === "C" || key === "⌫"
                          ? "bg-zinc-700/50 text-zinc-300 hover:bg-zinc-600/50 active:scale-95"
                          : "bg-white/10 text-white hover:bg-white/20 active:scale-95"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
