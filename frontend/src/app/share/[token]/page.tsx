import { PublicDashboardView } from "@/components/dashboards/PublicDashboardView";

export default function SharePage({ params }: { params: { token: string } }) {
  return <PublicDashboardView token={params.token} />;
}
