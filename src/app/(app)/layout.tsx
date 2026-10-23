import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { hasValidSession } from "@/lib/auth/server";

/** Signed-in app (Domov / Sparko / Moj katalog / letak). Re-checks the session server-side behind the proxy. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasValidSession())) redirect("/prijava");
  return <AppShell>{children}</AppShell>;
}
