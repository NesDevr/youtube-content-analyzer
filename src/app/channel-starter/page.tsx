import { redirect } from "next/navigation";

/** A channel begins as an explicit workspace, not an unavailable AI wizard. */
export default function ChannelStarterPage() {
  redirect("/workspaces");
}
