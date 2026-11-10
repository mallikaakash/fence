"use client";

import { useState } from "react";
import { InnerPage } from "@/components/layout/inner-page";
import { ProtectionWizard, type WizardStep } from "@/components/intentguard/protection-wizard";
import { ProtectionStatusBanner } from "@/components/intentguard/protection-status-banner";
import { SETUP_STEP_SUBTITLES, SETUP_STEPS } from "@/lib/product-copy";

const STEP_ORDER: WizardStep[] = ["intro", "connect", "limits", "sign", "done"];

export function SetupPageClient() {
  const [step, setStep] = useState<WizardStep>("intro");
  const idx = STEP_ORDER.indexOf(step);
  const stepLabel = SETUP_STEPS[idx] ?? SETUP_STEPS[0];
  const title =
    step === "intro"
      ? "Set up protection"
      : `Set up protection — ${stepLabel}`;

  return (
    <InnerPage title={title} subtitle={SETUP_STEP_SUBTITLES[idx] ?? SETUP_STEP_SUBTITLES[0]}>
      <div className="space-y-5">
        <ProtectionStatusBanner />
        <ProtectionWizard onStepChange={setStep} />
      </div>
    </InnerPage>
  );
}
