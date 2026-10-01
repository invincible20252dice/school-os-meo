import { Suspense } from "react";
import ChallengeClient from "./challenge-client";

export default function ChallengePage() {
  return <Suspense fallback={<p role="status">集客チャレンジを読み込んでいます。</p>}><ChallengeClient /></Suspense>;
}
