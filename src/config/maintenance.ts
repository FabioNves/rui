/**
 * Maintenance mode configuration
 *
 * Set MAINTENANCE_MODE to true to enable the maintenance page in production.
 * In development, the main app is always accessible regardless of this setting.
 */
export const MAINTENANCE_MODE = true;

export const MAINTENANCE_CONFIG = {
  title: "We'll be back soon!",
  subtitle: "RUI is currently undergoing scheduled maintenance",
  message:
    "We're working hard to improve your experience. Please check back shortly.",
  estimatedTime: "", // Optional: e.g., "Expected to be back by 3:00 PM UTC"
};
