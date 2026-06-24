"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";
import { AlertTriangle, CheckCircle, Info, XCircle, X } from "lucide-react";

export type ModalType = "confirmation" | "warning" | "error" | "success" | "info";

export interface ModalOptions {
  type?: ModalType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface ModalContextType {
  showModal: (options: ModalOptions) => void;
  hideModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalOptions | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const hideModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setModal(null);
      setIsClosing(false);
    }, 200); // Match animation duration
  };

  const showModal = (options: ModalOptions) => {
    setModal({
      type: "info",
      confirmText: "Confirm",
      cancelText: "Cancel",
      ...options,
    });
  };

  const handleConfirm = async () => {
    if (modal?.onConfirm) {
      await modal.onConfirm();
    }
    hideModal();
  };

  const handleCancel = () => {
    if (modal?.onCancel) {
      modal.onCancel();
    }
    hideModal();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!modal) return;
      if (e.key === "Escape") {
        handleCancel();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirm();
      }
    };
    
    if (modal) {
      window.addEventListener("keydown", handleKeyDown);
      // Focus trapping could be implemented here, but for now we'll just focus the container
      setTimeout(() => modalRef.current?.focus(), 10);
    }
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modal]);

  return (
    <ModalContext.Provider value={{ showModal, hideModal }}>
      {children}

      {modal && (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleCancel}></div>
          
          <div 
            ref={modalRef}
            tabIndex={-1}
            className={`relative w-full max-w-md glass-panel rounded-2xl border p-6 shadow-2xl focus:outline-none flex flex-col ${
              modal.type === 'warning' || modal.type === 'confirmation' ? 'border-amber-500/30 box-glow-amber' :
              modal.type === 'error' ? 'border-red-500/30 box-glow-red' :
              modal.type === 'success' ? 'border-emerald-500/30 box-glow-emerald' :
              'border-accentPurple/30 box-glow-purple'
            } ${isClosing ? 'scale-95 opacity-0 transition-all duration-200' : 'animate-slide-up'}`}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {modal.type === 'warning' || modal.type === 'confirmation' ? (
                  <AlertTriangle className="w-6 h-6 text-amber-500" />
                ) : modal.type === 'error' ? (
                  <XCircle className="w-6 h-6 text-red-500" />
                ) : modal.type === 'success' ? (
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                ) : (
                  <Info className="w-6 h-6 text-accentPurple" />
                )}
                <h3 className="font-extrabold text-white text-lg">{modal.title}</h3>
              </div>
              <button 
                onClick={handleCancel}
                className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="mb-8">
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                {modal.message}
              </p>
            </div>

            {/* Footer / Actions */}
            <div className="flex justify-end gap-3 mt-auto pt-4 border-t border-white/5">
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg bg-transparent hover:bg-white/5 text-sm font-bold text-slate-300 transition-colors"
              >
                {modal.cancelText}
              </button>
              <button
                onClick={handleConfirm}
                className={`px-6 py-2 rounded-lg text-sm font-bold text-white transition-colors shadow-lg ${
                  modal.type === 'warning' || modal.type === 'confirmation' ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20' :
                  modal.type === 'error' ? 'bg-red-600 hover:bg-red-500 shadow-red-500/20' :
                  modal.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' :
                  'bg-accentPurple hover:bg-accentPurpleHover shadow-accentPurple/20'
                }`}
              >
                {modal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}
