import { Suspense } from "react";
import SettingsPage from "../settings-page";

export default function LineSettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPage initialTab="line" />
    </Suspense>
  );
}
