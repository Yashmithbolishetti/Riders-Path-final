/**
 * Centralized pricing configuration and bidirectional calculation helpers
 * for Riders Path campus mobility.
 */

export const DAILY_HOUR_EQUIVALENT = 24;

/**
 * Calculates daily price from hourly price based on configured multiplier (1 day = 24 hours).
 * Prevents NaN, negative values, or infinite update loops.
 */
export function hourlyToDaily(hourly: number): number {
  if (typeof hourly !== 'number' || isNaN(hourly) || !isFinite(hourly) || hourly <= 0) return 0;
  return Math.max(0, Math.round(hourly * DAILY_HOUR_EQUIVALENT));
}

/**
 * Calculates hourly price from daily price based on configured multiplier (1 day = 24 hours).
 * Formats to standard 2-decimal rounded float for precision.
 */
export function dailyToHourly(daily: number): number {
  if (typeof daily !== 'number' || isNaN(daily) || !isFinite(daily) || daily <= 0) return 0;
  return Math.max(0, Math.round((daily / DAILY_HOUR_EQUIVALENT) * 100) / 100);
}

export const PRICING_HELPER_TEXT =
  'Hourly and daily prices stay synced automatically (1 day = 24 hours).';
