import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
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
            <div>
              <div style={{ fontWeight: 700 }}>Time Tracker</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {user.name} ({user.role})
              </div>
            </div>
            <nav className="nav-links">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="nav-link">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="container" style={{ paddingTop: "1rem", paddingBottom: "2rem" }}>
        {children}
      </main>
    </>
  );
}
