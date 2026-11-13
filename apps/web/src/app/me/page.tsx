import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await currentUser();
  redirect(user ? `/u/${user.login}` : "/auth/twitch/login?returnTo=/me");
}
