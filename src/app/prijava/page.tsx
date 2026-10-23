import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { LoginView } from "@/components/auth/LoginView";
import { readAuthConfig } from "@/lib/auth/config";
import { hasValidSession } from "@/lib/auth/server";
import { safeNext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Prijava · Sparko" };
export const viewport: Viewport = { themeColor: "#07482b" };

/** /prijava?next=<path> — demo login in front of the app. */
export default async function LoginPage({ searchParams }: PageProps<"/prijava">) {
  const next = safeNext((await searchParams).next);
  if (await hasValidSession()) redirect(next);
  return <LoginView next={next} configError={!readAuthConfig().ok} />;
}
