import { Suspense } from "react";
import ReviewAnalyticsClient from "./review-analytics-client";

export default function ReviewAnalyticsPage() {
  return <Suspense fallback={<p role="status">口コミ分析を読み込んでいます。</p>}><ReviewAnalyticsClient /></Suspense>;
}
