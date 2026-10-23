import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { getSession } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Skrbništvo · Sparko", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#07482b" };
export const dynamic = "force-dynamic";

/** /skrbnik — access administration (admins only; the proxy is the first gate, this re-checks). */
export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/prijava?next=/skrbnik");
  if (session.account.role !== "admin") redirect("/domov");
  return <AdminDashboard />;
}
