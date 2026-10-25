import React from 'react';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export const Toast: React.FC = () => {
  const { toast } = useAuth();

  if (!toast) return null;

  const toneStyles = {
    success: 'bg-white border-[#CBE2D6] text-[#202522]',
    error: 'bg-white border-[#E8C5C5] text-[#202522]',
    info: 'bg-white border-[#E5E4DE] text-[#202522]',
  }[toast.type];

  const iconColor = {
    success: 'text-[#347653]',
    error: 'text-[#B44242]',
    info: 'text-[#29483B]',
  }[toast.type];

  const Icon = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
  }[toast.type];

  return (
    <div
      id="toast-notification"
      className="fixed bottom-6 right-6 z-50 transition-all animate-in fade-in slide-in-from-bottom-3 max-w-md"
      role="status"
      aria-live="polite"
    >
      <div
        className={`${toneStyles} flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-xs font-medium`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
        <p>{toast.message}</p>
      </div>
    </div>
  );
};

export const ToastContainer = Toast;
