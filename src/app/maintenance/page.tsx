import MaintenancePage from "@/components/MaintenancePage";

/**
 * Preview route for the maintenance page.
 * Visit /maintenance to see how the maintenance page looks.
 *
 * Note: This route is for preview purposes only.
 * The actual maintenance mode is controlled by MAINTENANCE_MODE in src/config/maintenance.ts
 */
export default function MaintenancePreviewPage() {
  return <MaintenancePage />;
}
