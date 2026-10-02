import { Suspense } from "react";
import RankingClient from "./ranking-client";

export default function RankTrackerPage() {
  return <Suspense fallback={<p>順位データを読み込んでいます。</p>}><RankingClient /></Suspense>;
}
