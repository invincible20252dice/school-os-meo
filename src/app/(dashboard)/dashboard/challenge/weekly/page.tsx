import { Suspense } from "react";
import ChallengeClient from "../challenge-client";

export default function WeeklyChallengePage() {
  return <Suspense fallback={<p role="status">今週のアクションを読み込んでいます。</p>}><ChallengeClient weekly /></Suspense>;
}
