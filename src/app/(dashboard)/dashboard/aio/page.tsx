import { Suspense } from "react";
import AioClient from "./aio-client";

export default function AioDashboardPage() {
  return <Suspense fallback={<p role="status">読み込み中</p>}><AioClient /></Suspense>;
}
