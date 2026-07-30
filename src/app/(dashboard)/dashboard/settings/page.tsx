import { Suspense } from "react";
import SettingsPage from "./settings-page";

export default function SettingsRootPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPage initialTab="google" />
    </Suspense>
  );
}
