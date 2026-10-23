import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getSession } from "@/lib/auth/server";

/** Signed-in app (Domov / Sparko / Moj katalog / letak). Re-checks the session server-side behind the proxy. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/prijava");
  return <AppShell isAdmin={session.account.role === "admin"}>{children}</AppShell>;
}
