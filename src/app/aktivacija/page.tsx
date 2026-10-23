import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginView } from "@/components/auth/LoginView";
import { authBackend, hasValidSession } from "@/lib/auth/server";
import { ACTIVATION_COOKIE } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Aktivacija · Sparko",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const viewport: Viewport = { themeColor: "#07482b" };

/** /aktivacija — the proxy moved ?token=… into an HttpOnly cookie; the token never stays in the URL. */
export default async function ActivationPage() {
  if (await hasValidSession()) redirect("/domov");
  const ready = Boolean((await cookies()).get(ACTIVATION_COOKIE));
  return <LoginView next="/domov" configError={!authBackend()} activation={{ ready }} />;
}
