"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
    id: string;
    title: string;
    description?: string;
    type: ToastType;
    duration?: number;
}

interface ToastContextValue {
    toast: (opts: { title: string; description?: string; type?: ToastType; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
    return useContext(ToastContext);
}

const ICONS: Record<ToastType, React.ElementType> = {
    success: CheckCircle2,
    error:   XCircle,
    warning: AlertTriangle,
    info:    Info,
};
const COLORS: Record<ToastType, string> = {
    success: "border-emerald-500/30 bg-emerald-950/40 text-emerald-400",
    error:   "border-red-500/30 bg-red-950/40 text-red-400",
    warning: "border-yellow-500/30 bg-yellow-950/40 text-yellow-400",
    info:    "border-blue-500/30 bg-blue-950/40 text-blue-400",
};

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: string) => void }) {
    const Icon = ICONS[t.type];
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.93, transition: { duration: 0.15 } }}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl min-w-[280px] max-w-[380px] backdrop-blur-md ${COLORS[t.type]}`}
        >
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">{t.title}</div>
                {t.description && <div className="text-xs text-muted-foreground/70 mt-0.5">{t.description}</div>}
            </div>
            <button onClick={() => onDismiss(t.id)} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0">
                <X className="h-3.5 w-3.5" />
            </button>
        </motion.div>
    );
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const counter = useRef(0);

    const dismiss = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback(({ title, description, type = "info", duration = 4000 }: {
        title: string; description?: string; type?: ToastType; duration?: number;
    }) => {
        const id = String(++counter.current);
        setToasts((prev) => [...prev.slice(-4), { id, title, description, type, duration }]);
        setTimeout(() => dismiss(id), duration);
    }, [dismiss]);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {/* Portal-like fixed container */}
            <div className="fixed bottom-5 left-5 z-[200] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence mode="popLayout">
                    {toasts.map((t) => (
                        <div key={t.id} className="pointer-events-auto">
                            <ToastItem t={t} onDismiss={dismiss} />
                        </div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}
