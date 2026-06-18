import { redirect } from "next/navigation";

// Charts are edited in the SQL editor (their source), not a bespoke editor.
export default function ChartPage({ params }: { params: { id: string } }) {
  redirect(`/sql?chart=${params.id}`);
}
