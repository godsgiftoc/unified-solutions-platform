import { DashboardView } from "@/components/dashboards/DashboardView";

export default function MarketplaceDashboardPage({ params }: { params: { id: string } }) {
  return <DashboardView dashboardId={params.id} backHref="/marketplace" />;
}
