"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", icon: "📊", label: "Dashboard" },
  { href: "/dashboard/users", icon: "👥", label: "Users" },
  { href: "/dashboard/jobs", icon: "🏗️", label: "Jobs" },
  { href: "/dashboard/attendance", icon: "✅", label: "Attendance" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">🏗️ Your Chawk</div>

      <nav style={{ flex: 1 }}>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${pathname === item.href ? "active" : ""}`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <Link
          href="/"
          className="sidebar-link"
          onClick={() => localStorage.removeItem("admin_token")}
        >
          <span>🚪</span>
          <span>Logout</span>
        </Link>
      </div>
    </aside>
  );
}
