import React from 'react';
import { AlertTriangle, Trash2, X, Info } from 'lucide-react';

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface ConfirmModalProps {
  dialog: ConfirmDialogState;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ dialog, onClose }) => {
  if (!dialog.isOpen) return null;

  const {
    title,
    message,
    confirmText = 'Konfirmasi',
    cancelText = 'Batal',
    variant = 'danger',
    onConfirm,
  } = dialog;

  const handleConfirm = async () => {
    try {
      await onConfirm();
    } finally {
      onClose();
    }
  };

  const handleCancel = () => {
    if (dialog.onCancel) {
      dialog.onCancel();
    }
    onClose();
  };

  const getIcon = () => {
    switch (variant) {
      case 'danger':
        return (
          <div className="w-11 h-11 rounded-2xl bg-[#EF4444]/10 text-[#DC2626] border border-[#EF4444]/20 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
        );
      case 'warning':
        return (
          <div className="w-11 h-11 rounded-2xl bg-[#F59E0B]/10 text-[#D97706] border border-[#F59E0B]/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
        );
      default:
        return (
          <div className="w-11 h-11 rounded-2xl bg-[#2A2E28]/10 text-[#20231F] border border-[#20231F]/20 flex items-center justify-center shrink-0">
            <Info className="w-5 h-5" />
          </div>
        );
    }
  };

  const getConfirmButtonClasses = () => {
    if (variant === 'danger') {
      return 'bg-[#DC2626] hover:bg-[#B91C1C] text-white shadow-sm';
    }
    if (variant === 'warning') {
      return 'bg-[#D97706] hover:bg-[#B45309] text-white shadow-sm';
    }
    return 'bg-[#20231F] hover:bg-[#2A2E28] text-white shadow-sm';
  };

  return (
    <div
      id="custom-confirm-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141613]/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-sm bg-[#FFFFFF] border border-[#E5E5DF] rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5 text-left transform animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5">
            {getIcon()}
            <div>
              <h3 className="text-base font-semibold text-[#20231F] tracking-tight">{title}</h3>
              <p className="text-xs text-[#686D66] mt-1 leading-relaxed">{message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="text-[#9A9E96] hover:text-[#20231F] p-1 rounded-lg hover:bg-[#F1F1EC] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            id="btn-confirm-cancel"
            type="button"
            onClick={handleCancel}
            className="w-full py-2.5 px-4 rounded-xl border border-[#E5E5DF] text-[#686D66] hover:text-[#20231F] hover:bg-[#F7F6F2] font-medium text-xs sm:text-sm transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            id="btn-confirm-proceed"
            type="button"
            onClick={handleConfirm}
            className={`w-full py-2.5 px-4 rounded-xl font-medium text-xs sm:text-sm transition-all active:scale-[0.98] cursor-pointer ${getConfirmButtonClasses()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
