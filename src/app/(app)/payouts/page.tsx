import { redirect } from "next/navigation";

import { PayoutSummaryScreen } from "@/components/payout-summary-screen";
import { getSessionUser } from "@/lib/auth";

export default async function PayoutsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/contractor");
  return <PayoutSummaryScreen />;
}
