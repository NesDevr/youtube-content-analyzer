import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen } from "lucide-react";

export default function IdeasPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ideas</h1>
        <p className="text-muted-foreground mt-1">Keep the selected workspace’s saved evidence together. The evidence-to-idea research workflow arrives in Milestone C.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><FolderOpen className="h-5 w-5 text-primary mb-2" /><CardTitle>Saved evidence</CardTitle><CardDescription>Review folders of videos saved to this workspace, and choose the evidence worth developing.</CardDescription></CardHeader>
          <CardContent><Link className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90" href="/folders">Open saved evidence</Link></CardContent>
        </Card>
      </div>
    </div>
  );
}
