"use client";

import { FunnelMeter } from "@/components/workspace/funnel-meter";
import { StockInspector } from "@/components/workspace/stock-inspector";
import {
  WorkspaceBottomNav,
  WorkspaceRail,
} from "@/components/workspace/workspace-rail";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { UniversePanel } from "@/features/workspace/panels/UniversePanel";
import { QualityPanel } from "@/features/workspace/panels/QualityPanel";
import { TimingPanel } from "@/features/workspace/panels/TimingPanel";
import { StartupPanel } from "@/features/workspace/panels/StartupPanel";
import { CandidatesPanel } from "@/features/workspace/panels/CandidatesPanel";
import { PortfolioPanel } from "@/features/workspace/panels/PortfolioPanel";

export function WorkspaceShell() {
  const { tab, inspectorOpen } = useWorkspace();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <FunnelMeter />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <WorkspaceRail />

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {tab === "universe" && <UniversePanel />}
            {tab === "quality" && <QualityPanel />}
            {tab === "timing" && <TimingPanel />}
            {tab === "startup" && <StartupPanel />}
            {tab === "candidates" && <CandidatesPanel />}
            {tab === "portfolio" && <PortfolioPanel />}
          </div>
          {inspectorOpen && <StockInspector />}
        </div>
      </div>

      <WorkspaceBottomNav />
    </div>
  );
}
