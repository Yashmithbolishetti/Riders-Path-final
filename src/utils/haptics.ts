/**
 * Subtle, accessible haptic feedback utility for mobile and supported touch devices.
 * Gracefully no-ops when unsupported or blocked by browser policies.
 */

export type HapticType = 'light' | 'medium' | 'success' | 'warning' | 'error';

export function triggerHaptic(type: HapticType = 'light'): void {
  if (typeof window === 'undefined') return;

  // Check whether vibration API is supported on the client
  if (!('navigator' in window) || typeof window.navigator.vibrate !== 'function') {
    return;
  }

  try {
    switch (type) {
      case 'light':
        // Short subtle tap for clicks / toggles
        window.navigator.vibrate(8);
        break;
      case 'medium':
        // Standard interactive confirmation
        window.navigator.vibrate(15);
        break;
      case 'success':
        // Double micro-pulse for approval/submission success
        window.navigator.vibrate([10, 30, 15]);
        break;
      case 'warning':
        // Alert pulse for caution/notice
        window.navigator.vibrate([15, 30, 15]);
        break;
      case 'error':
        // Distinct alert vibration for rejection/validation failures
        window.navigator.vibrate([25, 40, 25]);
        break;
      default:
        window.navigator.vibrate(10);
    }
  } catch {
    // Non-blocking catch to ensure button events never fail
  }
}
