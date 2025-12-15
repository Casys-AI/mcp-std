import { page } from "fresh";
import type { FreshContext } from "fresh";
import { Head } from "fresh/runtime";
import GraphExplorer from "../islands/GraphExplorer.tsx";
import MetricsPanel from "../islands/MetricsPanel.tsx";
import TracingPanel from "../islands/TracingPanel.tsx";
import { DashboardLayout } from "../components/layout/mod.ts";
import type { AuthState } from "./_middleware.ts";

interface DashboardData {
  apiBase: string;
  isCloudMode: boolean;
  user: AuthState["user"];
}

export const handler = {
  GET(ctx: FreshContext<AuthState>) {
    // Read API base from env, default to localhost:3003 for dev
    const apiBase = Deno.env.get("API_BASE") || "http://localhost:3003";
    return page({
      apiBase,
      isCloudMode: ctx.state.isCloudMode,
      user: ctx.state.user,
    });
  },
};

export default function Dashboard({ data }: { data: DashboardData }) {
  const apiBase = data?.apiBase || "http://localhost:3003";
  const { isCloudMode, user } = data;

  return (
    <>
      <Head>
        <title>Casys PML - Graph Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Cytoscape.js for graph visualization */}
        <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js"></script>
        {/* Dagre layout for hierarchical graphs */}
        <script src="https://cdn.jsdelivr.net/npm/dagre@0.8.5/dist/dagre.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
        <style>
          {`
          * {
            scrollbar-width: thin;
            scrollbar-color: var(--accent-dim) transparent;
          }

          *::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }

          *::-webkit-scrollbar-track {
            background: transparent;
          }

          *::-webkit-scrollbar-thumb {
            background: var(--accent-dim);
            border-radius: 3px;
          }

          *::-webkit-scrollbar-thumb:hover {
            background: var(--accent-medium);
          }
        `}
        </style>
      </Head>

      <DashboardLayout
        user={user}
        isCloudMode={isCloudMode}
        rightPanel={
          <>
            <MetricsPanel apiBase={apiBase} position="sidebar" />
            <TracingPanel apiBase={apiBase} />
          </>
        }
      >
        <GraphExplorer apiBase={apiBase} />
      </DashboardLayout>
    </>
  );
}
