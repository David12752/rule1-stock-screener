"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCandidates, useWorkspace } from "@/components/workspace/workspace-context";
import { VirtualTable } from "@/components/workspace/virtual-table";
import { PanelHeader } from "@/components/workspace/panel-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Target } from "lucide-react";
import { exportRows } from "../shared";
import { CANDIDATE_COLUMNS } from "../columns";

export function CandidatesPanel() {
  const { candidateMode, setCandidateMode, openInspector, setTab } = useWorkspace();
  const candidates = useCandidates();

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <PanelHeader
        title="מועמדים מאוחדים"
        description="שלב 4 — דירוג משולב: פסיקה + תבנית + מרווח ביטחון. לחיצה על שורה פותחת בדיקה מהירה."
        trailing={
          <>
            {(
              [
                ["both", "שניהם"],
                ["quality", "איכות"],
                ["timing", "תזמון"],
                ["any", "הכל"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={candidateMode === id ? "default" : "outline"}
                onClick={() => setCandidateMode(id)}
              >
                {label}
              </Button>
            ))}
            <Badge variant="outline" className="font-mono">
              {candidates.length}
            </Badge>
          </>
        }
        actions={[
          {
            label: "ייצוא CSV",
            onClick: () => {
              void exportRows(candidates, "csv", "מועמדים מאוחדים", "candidates").catch(
                () => {}
              );
            },
            disabled: candidates.length === 0,
          },
          {
            label: "ייצוא HTML",
            onClick: () => {
              void exportRows(candidates, "html", "מועמדים מאוחדים", "candidates").catch(
                () => {}
              );
            },
            disabled: candidates.length === 0,
          },
        ]}
      />

      <VirtualTable
        rows={candidates}
        rowKey={(c) => c.symbol}
        onRowClick={(c) => openInspector(c.symbol)}
        emptyLabel={
          <EmptyState
            icon={Target}
            title="אין חיתוך עדיין"
            description="השלימו איכות ואז תזמון במשפך למעלה — המועמדים הם החיתוך של שניהם."
            actionLabel="סריקת איכות"
            onAction={() => setTab("quality")}
            secondaryLabel="סריקת תזמון"
            onSecondary={() => setTab("timing")}
          />
        }
        columns={CANDIDATE_COLUMNS}
      />
    </div>
  );
}
