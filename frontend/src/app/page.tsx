"use client";

import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function HomePage() {
  return (
    <WorkspaceProvider>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}
