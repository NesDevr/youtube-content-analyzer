import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

/** Every page writes into one channel workspace, so none of them work without one. */
export function WorkspaceRequired({ action }: { action: string }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-12 text-center">
        <p className="font-medium">Choose a channel workspace to {action}.</p>
        <p className="text-sm text-muted-foreground">Everything you save belongs to one planned or active channel.</p>
        <Link href="/workspaces" className={buttonVariants({ variant: "outline" })}>
          Manage channel workspaces
        </Link>
      </CardContent>
    </Card>
  );
}
