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

  // Wait for check to complete
  if (!checked && MAINTENANCE_MODE && !isDevelopment) {
    return null; // or a loading spinner
  }

  // Show maintenance page only in production when MAINTENANCE_MODE is true and not bypassed
  if (MAINTENANCE_MODE && !isDevelopment && !bypassed) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}
