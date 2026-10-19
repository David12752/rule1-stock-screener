"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Message {
    role: "user" | "assistant";
    content: string;
}

const STARTER_QUESTIONS = [
    "האם המניה הזו שווה להשקעה לפי כלל מספר 1?",
    "מה חולשות המניה הזו?",
    "מה ה-Big 5 אומרים על הצמיחה?",
    "מתי כדאי לקנות את המניה?",
    "הסבר את ה-Moat של החברה",
];

export function AIChatPanel({ ticker }: { ticker: string }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const send = async (text: string) => {
        const msg = text.trim();
        if (!msg || loading) return;
        setInput("");
        setError(null);

        const userMsg: Message = { role: "user", content: msg };
        const updatedHistory = [...messages, userMsg];
        setMessages(updatedHistory);
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/stock/${ticker}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: msg,
                    history: messages.map((m) => ({ role: m.role, content: m.content })),
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: "שגיאה" }));
                throw new Error(err.detail || "שגיאה");
            }
            const data = await res.json();
            setMessages([...updatedHistory, { role: "assistant", content: data.response }]);
        } catch (e: any) {
            setError(e.message || "שגיאה בחיבור ל-AI");
        } finally {
            setLoading(false);
        }
    };

    const reset = () => { setMessages([]); setError(null); };

    return (
        <div className="flex flex-col h-[600px] rounded-2xl border border-white/[0.06] bg-card/30 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
                        <Sparkles className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div>
                        <div className="text-sm font-semibold">AI Rule #1 Assistant</div>
                        <div className="text-[10px] text-muted-foreground/50">שאל כל שאלה על {ticker}</div>
                    </div>
                </div>
                {messages.length > 0 && (
                    <button onClick={reset} className="text-xs text-muted-foreground/40 hover:text-muted-foreground flex items-center gap-1 transition-colors">
                        <RotateCcw className="h-3 w-3" /> איפוס
                    </button>
                )}
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                        <div className="h-14 w-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
                            <Sparkles className="h-6 w-6 text-violet-400" />
                        </div>
                        <p className="text-sm text-muted-foreground/60 mb-6 max-w-xs">
                            שאל אותי כל שאלה על {ticker} — נתוני המניה טעונים מה-backend.
                        </p>
                        <div className="flex flex-col gap-2 w-full max-w-sm">
                            {STARTER_QUESTIONS.map((q) => (
                                <button
                                    key={q}
                                    onClick={() => send(q)}
                                    className="text-xs text-start px-4 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all text-muted-foreground/70 hover:text-foreground"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <AnimatePresence initial={false}>
                        {messages.map((m, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                            >
                                <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                                    m.role === "user"
                                        ? "bg-primary/20 border border-primary/30"
                                        : "bg-violet-500/15 border border-violet-500/25"
                                }`}>
                                    {m.role === "user"
                                        ? <User className="h-3.5 w-3.5 text-primary" />
                                        : <Bot className="h-3.5 w-3.5 text-violet-400" />}
                                </div>
                                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                    m.role === "user"
                                        ? "bg-primary/15 border border-primary/20 text-foreground rounded-tr-sm"
                                        : "bg-white/[0.04] border border-white/[0.06] text-foreground/90 rounded-tl-sm"
                                }`}>
                                    {m.content}
                                </div>
                            </motion.div>
                        ))}
                        {loading && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                                <div className="h-7 w-7 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
                                    <Bot className="h-3.5 w-3.5 text-violet-400" />
                                </div>
                                <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3">
                                    <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}

                {error && (
                    <div className="text-xs text-red-400/80 bg-red-950/20 border border-red-500/20 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-white/[0.06]">
                <div className="flex gap-2">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send(input)}
                        placeholder="שאל שאלה על המניה..."
                        disabled={loading}
                        className="flex-1 h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm placeholder:text-muted-foreground/30 focus:outline-none focus:border-violet-500/40 transition-colors disabled:opacity-50"
                    />
                    <Button
                        size="sm"
                        disabled={loading || !input.trim()}
                        onClick={() => send(input)}
                        className="h-9 w-9 p-0 rounded-xl bg-violet-600 hover:bg-violet-500 text-white"
                    >
                        <Send className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
