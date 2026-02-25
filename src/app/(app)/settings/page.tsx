import { redirect } from "next/navigation";

import { SettingsForm } from "@/components/settings-form";
import { getSessionUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/contractor");
  return <SettingsForm />;
}
