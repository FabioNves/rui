"use client";

import { ReactNode, useEffect, useState } from "react";
import MaintenancePage from "@/components/MaintenancePage";
import { MAINTENANCE_MODE } from "@/config/maintenance";

const BYPASS_KEY = "rui_maintenance_bypass";

interface MaintenanceWrapperProps {
  children: ReactNode;
}

export default function MaintenanceWrapper({
  children,
}: MaintenanceWrapperProps) {
  const [bypassed, setBypassed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Check sessionStorage for bypass
    const bypassValue = sessionStorage.getItem(BYPASS_KEY);
    if (bypassValue === "true") {
      setBypassed(true);
    }
    setChecked(true);
  }, []);

  // In development mode, always show the main app
  const isDevelopment = process.env.NODE_ENV === "development";

  // Show maintenance page only in production when MAINTENANCE_MODE is true and not bypassed
  // Don't show maintenance page until we've checked sessionStorage
  if (MAINTENANCE_MODE && !isDevelopment && checked && !bypassed) {
    return <MaintenancePage />;
  }

  // Show nothing while checking (very brief)
  if (MAINTENANCE_MODE && !isDevelopment && !checked) {
    return (
      <div
        className="min-h-screen w-full"
        style={{ backgroundColor: "#1a044a" }}
      />
    );
  }

  return <>{children}</>;
}
