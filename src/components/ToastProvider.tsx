"use client";

import React, { createContext, useContext, ReactNode, useCallback } from "react";
import { Toaster, toast as sonnerToast } from "sonner";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void; // Provided for backwards compatibility, sonner auto-dismisses
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const addToast = useCallback((type: ToastType, message: string) => {
    if (type === "success") {
      sonnerToast.success(message);
    } else if (type === "error") {
      sonnerToast.error(message);
    } else {
      sonnerToast.info(message);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    sonnerToast.dismiss(id);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <Toaster 
        theme="dark" 
        position="bottom-right" 
        toastOptions={{
          style: {
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#f8fafc',
          },
          className: 'glass-toast'
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
