import Component from "@/components/ui/projects-table";

export default function DesignPreviewPage() {
  return (
    <div className="min-h-screen bg-gray-200 dark:bg-neutral-950 p-4">
      <div className="w-full h-[calc(100vh-2rem)]">
        <Component />
      </div>
    </div>
  );
}
