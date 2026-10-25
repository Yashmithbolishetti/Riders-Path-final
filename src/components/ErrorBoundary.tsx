import React, { useState, useEffect } from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';

export const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Captured window error:', event.error);
      setHasError(true);
      setErrorMessage(event.message || 'An unexpected display issue occurred.');
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.warn('Unhandled rejection captured:', event.reason);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  const handleReset = () => {
    setHasError(false);
    setErrorMessage('');
    window.location.hash = '';
    window.location.reload();
  };

  if (hasError) {
    return (
      <div className="min-h-screen bg-[#F7F6F2] text-[#202522] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white border border-[#E5E4DE] rounded-xl p-8 text-center space-y-5 shadow-sm">
          <div className="w-12 h-12 rounded-lg bg-[#F9EDED] border border-[#E8C5C5] text-[#B44242] mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>

          <div className="space-y-1.5">
            <h1 className="font-display font-semibold text-xl text-[#202522]">
              Application Notice
            </h1>
            <p className="text-xs text-[#70756F] leading-relaxed">
              Riders Path encountered a display issue. Your saved bookings, fleet records, and settings are preserved.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 bg-[#F7F6F2] rounded-lg border border-[#E5E4DE] text-xs font-mono text-[#8F3030] text-left overflow-x-auto max-h-24">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button onClick={handleReset} className="rp-btn rp-btn-primary flex-1">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reload Application</span>
            </button>
            <button
              onClick={() => {
                window.location.hash = '#home';
                window.location.reload();
              }}
              className="rp-btn rp-btn-secondary"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Home</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
