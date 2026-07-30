import { Suspense } from "react";
import SettingsPage from "../settings-page";

export default function InstagramSettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPage initialTab="instagram" />
    </Suspense>
  );
}
