import { DashboardShell } from "@/components/DashboardShell";
import { getDashboardData } from "@/lib/dashboard-data";
import { TestCallSimulator } from "./TestCallSimulator";

export default async function TestCallPage() {
  const data = await getDashboardData();

  return (
    <DashboardShell title="Test Call" eyebrow="AI simulator">
      <TestCallSimulator initialGreeting={data.aiSettings.greeting} />
    </DashboardShell>
  );
}
