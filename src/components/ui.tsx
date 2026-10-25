import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  X,
  Info,
} from 'lucide-react';

/**
 * Riders Path — Part 1 Design Tokens (Single Source of Truth)
 */
export const DESIGN_TOKENS = {
  colors: {
    bgPrimary: '#F7F6F2',
    bgSurface: '#FFFFFF',
    bgMuted: '#EFEEE8',
    textPrimary: '#202522',
    textSecondary: '#70756F',
    accentPrimary: '#29483B',
    accentHover: '#20392F',
    borderSubtle: '#E5E4DE',
    statusSuccess: '#347653',
    statusWarning: '#9A6B25',
    statusError: '#B44242',
  },
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
  },
} as const;

/* ==========================================================================
   1. BUTTON COMPONENT
   ========================================================================== */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}) => {
  const variantClass = {
    primary: 'rp-btn-primary',
    secondary: 'rp-btn-secondary',
    ghost: 'rp-btn-ghost',
    danger: 'rp-btn-danger',
  }[variant];

  const sizeClass = {
    sm: 'rp-btn-sm',
    md: '',
    lg: 'rp-btn-lg',
  }[size];

  return (
    <button
      className={`rp-btn ${variantClass} ${sizeClass} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

/* ==========================================================================
   2. STATUS INDICATOR COMPONENT (Accessible: Icon + Text + Restrained Color)
   ========================================================================== */

export type SemanticStatus = 'success' | 'warning' | 'error' | 'neutral';

export interface StatusIndicatorProps {
  tone?: SemanticStatus;
  label: string;
  showIcon?: boolean;
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  tone = 'neutral',
  label,
  showIcon = true,
  className = '',
}) => {
  const toneClass = {
    success: 'rp-status-success',
    warning: 'rp-status-warning',
    error: 'rp-status-error',
    neutral: 'rp-status-neutral',
  }[tone];

  const Icon = {
    success: CheckCircle2,
    warning: Clock,
    error: AlertCircle,
    neutral: Info,
  }[tone];

  return (
    <span className={`rp-status ${toneClass} ${className}`}>
      {showIcon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
};

/* ==========================================================================
   3. FORM FIELD WRAPPERS
   ========================================================================== */

export interface FieldGroupProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  rightMeta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const FieldGroup: React.FC<FieldGroupProps> = ({
  label,
  htmlFor,
  required,
  helperText,
  error,
  rightMeta,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {(label || rightMeta) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label htmlFor={htmlFor} className="rp-label !mb-0">
              {label} {required && <span className="text-[#B44242]">*</span>}
            </label>
          )}
          {rightMeta && <span className="text-xs text-[#70756F]">{rightMeta}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-xs text-[#B44242] flex items-center gap-1.5 font-medium" role="alert">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="rp-helper">{helperText}</p>
      ) : null}
    </div>
  );
};

/* ==========================================================================
   4. PAGE HEADER COMPONENT
   ========================================================================== */

export interface PageHeaderProps {
  kicker?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  kicker,
  title,
  description,
  actions,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#E5E4DE] ${className}`}
    >
      <div className="space-y-1.5 max-w-2xl">
        {kicker && <span className="rp-kicker block">{kicker}</span>}
        <h1 className="rp-page-title">{title}</h1>
        {description && <p className="rp-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
};

/* ==========================================================================
   5. MODAL DIALOG COMPONENT
   ========================================================================== */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = 'lg',
  children,
  footer,
}) => {
  if (!open) return null;

  const widthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
  }[maxWidth];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202522]/45 backdrop-blur-[2px] animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${widthClass} bg-white border border-[#E5E4DE] rounded-xl shadow-xl max-h-[90vh] flex flex-col overflow-hidden`}
      >
        <div className="px-6 py-4 border-b border-[#E5E4DE] flex items-center justify-between bg-[#F7F6F2]/60">
          <div>
            <h3 className="font-display font-semibold text-base text-[#202522]">{title}</h3>
            {subtitle && <p className="text-xs text-[#70756F] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[#70756F] hover:text-[#202522] hover:bg-[#EFEEE8] transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-[#E5E4DE] bg-[#F7F6F2]/60 flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/* ==========================================================================
   6. EMPTY, LOADING & ERROR STATES
   ========================================================================== */

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="p-12 rounded-xl bg-white border border-[#E5E4DE] text-center space-y-3">
    {icon && (
      <div className="w-10 h-10 rounded-lg bg-[#EFEEE8] border border-[#E5E4DE] text-[#70756F] flex items-center justify-center mx-auto">
        {icon}
      </div>
    )}
    <div className="space-y-1 max-w-sm mx-auto">
      <h3 className="font-display font-semibold text-base text-[#202522]">{title}</h3>
      {description && <p className="text-xs text-[#70756F] leading-relaxed">{description}</p>}
    </div>
    {action && <div className="pt-2">{action}</div>}
  </div>
);

export const LoadingState: React.FC<{ label?: string }> = ({
  label = 'Loading information...',
}) => (
  <div className="py-16 px-4 text-center space-y-3">
    <div className="w-7 h-7 border-2 border-[#29483B] border-t-transparent rounded-full animate-spin mx-auto" />
    <p className="text-xs text-[#70756F] font-medium">{label}</p>
  </div>
);

export const ErrorAlert: React.FC<{ message: string; className?: string }> = ({
  message,
  className = '',
}) => (
  <div
    className={`p-3.5 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#8F3030] text-xs font-medium flex items-start gap-2.5 ${className}`}
    role="alert"
  >
    <AlertCircle className="w-4 h-4 text-[#B44242] shrink-0 mt-0.5" />
    <span>{message}</span>
  </div>
);
