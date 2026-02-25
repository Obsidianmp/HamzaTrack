import { redirect } from "next/navigation";

import { ContractorDashboard } from "@/components/contractor-dashboard";
import { getSessionUser } from "@/lib/auth";

export default async function ContractorPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "contractor") redirect("/admin");
  return <ContractorDashboard />;
}
