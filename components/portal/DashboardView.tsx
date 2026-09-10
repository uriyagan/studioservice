import { Card } from "@/components/ui/Card";
import { PackageStatus } from "@/components/portal/PackageStatus";
import { ProjectStats } from "@/lib/types";

// Read-only status of every project the client is associated with.
export function DashboardView({ projects }: { projects: ProjectStats[] }) {
  return (
    <div className="space-y-4">
      {projects.map((p) => (
        <Card key={p.id}>
          <h2 className="font-semibold text-slate-900">{p.name}</h2>
          <PackageStatus project={p} className="mt-3" />
        </Card>
      ))}
    </div>
  );
}
