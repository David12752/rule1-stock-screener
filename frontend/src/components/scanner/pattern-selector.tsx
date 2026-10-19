"use client";

import { Badge } from "@/components/ui/badge";

interface Pattern {
    id: string;
    name: string;
    type: "bullish" | "bearish";
    description: string;
}

interface PatternSelectorProps {
    patterns: Pattern[];
    selected: string[];
    onSelectionChange: (selected: string[]) => void;
}

export function PatternSelector({
    patterns,
    selected,
    onSelectionChange,
}: PatternSelectorProps) {
    const togglePattern = (id: string) => {
        if (selected.includes(id)) {
            onSelectionChange(selected.filter((s) => s !== id));
        } else {
            onSelectionChange([...selected, id]);
        }
    };

    const selectAll = () => {
        onSelectionChange(patterns.map((p) => p.id));
    };

    const clearAll = () => {
        onSelectionChange([]);
    };

    const bullish = patterns.filter((p) => p.type === "bullish");
    const bearish = patterns.filter((p) => p.type === "bearish");

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    בחירת דפוסים
                </h3>
                <div className="flex gap-2">
                    <button
                        onClick={selectAll}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        בחר הכל
                    </button>
                    <span className="text-xs text-muted-foreground">|</span>
                    <button
                        onClick={clearAll}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                        נקה
                    </button>
                </div>
            </div>

            {/* Bullish Patterns */}
            <div>
                <p className="text-xs text-green-500 font-semibold mb-1.5">▲ שורי</p>
                <div className="flex flex-wrap gap-1.5">
                    {bullish.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => togglePattern(p.id)}
                            title={p.description}
                            className={`px-3 py-1.5 text-xs rounded-md border transition-all cursor-pointer ${
                                selected.includes(p.id)
                                    ? "bg-green-950/50 border-green-500 text-green-400 shadow-[0_0_8px_rgba(34,197,94,0.2)]"
                                    : "bg-secondary/30 border-border text-muted-foreground hover:border-green-500/50"
                            }`}
                        >
                            {p.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Bearish Patterns */}
            <div>
                <p className="text-xs text-red-500 font-semibold mb-1.5">▼ דובי</p>
                <div className="flex flex-wrap gap-1.5">
                    {bearish.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => togglePattern(p.id)}
                            title={p.description}
                            className={`px-3 py-1.5 text-xs rounded-md border transition-all cursor-pointer ${
                                selected.includes(p.id)
                                    ? "bg-red-950/50 border-red-500 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.2)]"
                                    : "bg-secondary/30 border-border text-muted-foreground hover:border-red-500/50"
                            }`}
                        >
                            {p.name}
                        </button>
                    ))}
                </div>
            </div>

            {selected.length > 0 && (
                <p className="text-xs text-muted-foreground">
                    {selected.length} דפוסים נבחרו
                </p>
            )}
        </div>
    );
}
