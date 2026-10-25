import React, { useState, useEffect } from 'react';
import { validateIcfaiEnrollment, ICFAI_ENROLLMENT_PLACEHOLDER } from '../utils/validation';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface EnrollmentNumberInputProps {
  id?: string;
  value: string;
  onChange: (value: string, isValid: boolean) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  showStatusBadge?: boolean;
  showHelpText?: boolean;
  customError?: string;
  error?: string;
}

export const EnrollmentNumberInput: React.FC<EnrollmentNumberInputProps> = ({
  id = 'icfai-enrollment-input',
  value,
  onChange,
  label = 'ICFAI Enrollment Number',
  required = true,
  disabled = false,
  className = '',
  showStatusBadge = true,
  showHelpText = true,
  customError,
  error,
}) => {
  const [touched, setTouched] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!touched && !value) {
      setLocalError(undefined);
      return;
    }

    if (value) {
      const res = validateIcfaiEnrollment(value);
      setLocalError(res.valid ? undefined : res.error);
    } else if (required && touched) {
      setLocalError('Enter your ICFAI enrollment number.');
    } else {
      setLocalError(undefined);
    }
  }, [value, touched, required]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Automatically trim leading/trailing spaces and convert lowercase to uppercase
    const rawVal = e.target.value.trim().toUpperCase();
    const res = validateIcfaiEnrollment(rawVal);
    onChange(rawVal, res.valid);
  };

  const handleBlur = () => {
    setTouched(true);
    if (value) {
      const res = validateIcfaiEnrollment(value);
      setLocalError(res.valid ? undefined : res.error);
    } else if (required) {
      setLocalError('Enter your ICFAI enrollment number.');
    }
  };

  const displayError = customError || error || (touched ? localError : undefined);
  const validationResult = validateIcfaiEnrollment(value);
  const isValid = Boolean(value) && validationResult.valid;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id} className="rp-label !mb-0">
            {label} {required && <span className="text-[#B44242]">*</span>}
          </label>
          <span className="text-[11px] font-mono text-[#70756F]">
            {ICFAI_ENROLLMENT_PLACEHOLDER}
          </span>
        </div>
      )}

      <div className="relative">
        <input
          id={id}
          type="text"
          required={required}
          disabled={disabled}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={ICFAI_ENROLLMENT_PLACEHOLDER}
          aria-invalid={Boolean(displayError)}
          aria-describedby={displayError ? `${id}-error` : showHelpText ? `${id}-helper` : undefined}
          className={`rp-input font-mono uppercase pr-24 ${
            displayError
              ? '!border-[#B44242] focus:!border-[#B44242]'
              : isValid
              ? '!border-[#347653] focus:!border-[#347653]'
              : ''
          }`}
        />

        {showStatusBadge && (
          <div className="absolute right-2.5 top-2 flex items-center gap-1 pointer-events-none">
            {isValid ? (
              <span className="rp-status rp-status-success !py-0.5 !px-2 !text-[10px] font-mono">
                <CheckCircle2 className="w-3 h-3" />
                <span>Valid ID</span>
              </span>
            ) : (
              <span className="rp-status rp-status-neutral !py-0.5 !px-2 !text-[10px] font-mono">
                ICFAI ID
              </span>
            )}
          </div>
        )}
      </div>

      {displayError ? (
        <p
          id={`${id}-error`}
          className="text-xs text-[#B44242] flex items-center gap-1.5 font-medium"
          role="alert"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{displayError}</span>
        </p>
      ) : showHelpText ? (
        <p id={`${id}-helper`} className="rp-helper">
          Enter your official ICFAI Hyderabad enrollment number.
        </p>
      ) : null}
    </div>
  );
};
