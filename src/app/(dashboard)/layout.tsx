import { Suspense, type ReactNode } from "react";
import AuthApprovalGate from "@/components/dashboard/AuthApprovalGate";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import Sidebar from "@/components/dashboard/Sidebar";
import styles from "./layout.module.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <AuthApprovalGate />
      <Sidebar />
      <div className={styles.content}>
        <Suspense fallback={null}>
          <DashboardHeader />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
