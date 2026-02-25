import { redirect } from "next/navigation";

import { AppNavLinks } from "@/components/app-nav-links";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSessionUser } from "@/lib/auth";

export default async function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const links =
    user.role === "admin"
      ? [
          { href: "/admin", label: "Dashboard" },
          { href: "/settings", label: "Settings" }
        ]
      : [{ href: "/contractor", label: "Timer" }];

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <div className="row" style={{ gap: "1rem" }}>
            <Brand compact subtitle={`${user.name} (${user.role})`} />
            <AppNavLinks links={links} />
          </div>
          <div className="row">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="container" style={{ paddingTop: "1rem", paddingBottom: "2rem" }}>
        {children}
      </main>
    </>
  );
}
