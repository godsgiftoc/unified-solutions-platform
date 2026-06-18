import { NotebookEditor } from "@/components/notebooks/NotebookEditor";

export default function NotebookPage({ params }: { params: { id: string } }) {
  return <NotebookEditor notebookId={params.id} />;
}
