import { Suspense } from "react";
import SettingsPage from "../settings-page";

export default function GoogleSettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPage initialTab="google" />
    </Suspense>
  );
}
