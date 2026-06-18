import { DashboardBuilder } from "@/components/dashboards/DashboardBuilder";

export default function DashboardPage({ params }: { params: { id: string } }) {
  return <DashboardBuilder dashboardId={params.id} />;
}
