import { Suspense } from "react";
import OverviewClient from "./overview-client";

export default function DashboardHomePage() {
  return <Suspense fallback={<p role="status">ダッシュボードを読み込んでいます。</p>}><OverviewClient /></Suspense>;
}
