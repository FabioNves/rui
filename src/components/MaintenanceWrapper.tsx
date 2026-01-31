"use client";

import { ReactNode } from "react";
import MaintenancePage from "@/components/MaintenancePage";
import { MAINTENANCE_MODE } from "@/config/maintenance";

interface MaintenanceWrapperProps {
  children: ReactNode;
}

export default function MaintenanceWrapper({
  children,
}: MaintenanceWrapperProps) {
  // In development mode, always show the main app
  const isDevelopment = process.env.NODE_ENV === "development";

  // Show maintenance page only in production when MAINTENANCE_MODE is true
  if (MAINTENANCE_MODE && !isDevelopment) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}
