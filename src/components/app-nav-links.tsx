"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppNavLinks({
  links
}: {
  links: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();

  return (
    <nav className="nav-links">
      {links.map((link) => {
        const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link key={link.href} href={link.href} className={`nav-link ${isActive ? "active" : ""}`}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
