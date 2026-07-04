"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/servers", label: "Servers", icon: "🖥" },
  { href: "/patches", label: "Patches", icon: "◈" },
  { href: "/plan", label: "Deployment Plans", icon: "⇶" },
  { href: "/reports", label: "Reports", icon: "▤" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
              ? "active"
              : ""
          }
        >
          <span aria-hidden>{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
