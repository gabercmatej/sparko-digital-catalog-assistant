import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { LoginView } from "@/components/auth/LoginView";
import { authBackend, hasValidSession } from "@/lib/auth/server";
import { safeNext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Prijava · Sparko", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#07482b" };

/** /prijava?next=<path> — sign-in for individual accounts in front of the app. */
export default async function LoginPage({ searchParams }: PageProps<"/prijava">) {
  const next = safeNext((await searchParams).next);
  if (await hasValidSession()) redirect(next);
  return <LoginView next={next} configError={!authBackend()} />;
}
