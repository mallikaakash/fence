import { AppShell } from "@/components/layout/app-shell";
import { SetupPageClient } from "@/components/intentguard/setup-page-client";

export default function StartPage() {
  return (
    <AppShell>
      <SetupPageClient />
    </AppShell>
  );
}
