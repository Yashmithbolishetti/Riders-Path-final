/**
 * ICFAI University Enrollment Number format validation utilities.
 * Consistent across student login, booking, profile, owner listing, and admin screens.
 */

export const ICFAI_ENROLLMENT_EXAMPLE = '26FMUCHH01XXXX';
export const ICFAI_ENROLLMENT_PLACEHOLDER = 'Example: 26FMUCHH01XXXX';

export interface EnrollmentValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

/**
 * Validates ICFAI enrollment number according to strict platform guidelines:
 * - Required when applicable
 * - Trim leading and trailing spaces
 * - Convert lowercase letters to uppercase automatically
 * - Minimum 10 characters
 * - Letters and numbers only (no spaces or special characters)
 * - Specific error messages for empty, too short, and invalid characters
 */
export function validateIcfaiEnrollment(enrollment: string): EnrollmentValidationResult {
  if (!enrollment || typeof enrollment !== 'string') {
    return {
      valid: false,
      normalized: '',
      error: 'Enter your ICFAI enrollment number.',
    };
  }

  const clean = enrollment.trim().toUpperCase();

  if (!clean) {
    return {
      valid: false,
      normalized: '',
      error: 'Enter your ICFAI enrollment number.',
    };
  }

  if (/\s/.test(clean) || !/^[A-Z0-9]+$/.test(clean)) {
    return {
      valid: false,
      normalized: clean,
      error: 'Use only letters and numbers, without spaces or symbols.',
    };
  }

  if (clean.length < 10) {
    return {
      valid: false,
      normalized: clean,
      error: 'Enrollment number must be at least 10 characters.',
    };
  }

  return {
    valid: true,
    normalized: clean,
  };
}
