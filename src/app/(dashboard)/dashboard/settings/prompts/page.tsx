import { Suspense } from "react";
import SettingsPage from "../settings-page";

export default function PromptSettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPage initialTab="prompts" />
    </Suspense>
  );
}
