import React from 'react';
import { ConfirmEmailPage } from './ConfirmEmailPage';

interface VerifyEmailPageProps {
  onNavigate: (view: string, params?: any) => void;
}

export const VerifyEmailPage: React.FC<VerifyEmailPageProps> = ({ onNavigate }) => {
  return <ConfirmEmailPage onNavigate={onNavigate} routeHash="#verify-email" />;
};
