"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface User {
  id: string;
  phoneNumber: string;
  name: string | null;
  skill: string | null;
  city: string | null;
  preferredLanguage: string;
  aadhaarNumber: string | null;
  panNumber: string | null;
  role: string;
  isOnboarded: boolean;
  availableFrom: string | null;
  createdAt: string;
}

const langMap: Record<string, string> = { en: "English", hi: "Hindi", kn: "Kannada", bn: "Bengali" };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (roleFilter) params.set("role", roleFilter);

    fetch(`${API}/api/dashboard/users?${params}`)
      .then((r) => r.json())
      .then((data) => { setUsers(data.users); setTotal(data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, roleFilter]);

  return (
    <div>
      <h1 className="page-title">Users</h1>
      <p className="page-subtitle">All registered workers and contractors</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {["", "worker", "contractor"].map((r) => (
          <button
            key={r}
            className="btn"
            onClick={() => { setRoleFilter(r); setPage(1); }}
            style={{
              background: roleFilter === r ? "linear-gradient(135deg, var(--accent), #8b5cf6)" : "var(--bg-card)",
              color: roleFilter === r ? "white" : "var(--text-secondary)",
              border: `1px solid ${roleFilter === r ? "transparent" : "var(--border)"}`,
            }}
          >
            {r === "" ? "All" : r === "worker" ? "👷 Workers" : "🏢 Contractors"}
          </button>
        ))}
        <span style={{ marginLeft: "auto", color: "var(--text-muted)", alignSelf: "center", fontSize: "0.85rem" }}>
          {total} total
        </span>
      </div>

      <div className="glass-card" style={{ overflow: "auto" }}>
        {loading ? (
          <div className="loading-container"><div className="spinner" /></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Role</th>
                <th>City</th>
                <th>Skill</th>
                <th>Aadhaar</th>
                <th>Language</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name || "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{u.phoneNumber}</td>
                  <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                  <td>{u.city || "—"}</td>
                  <td>{u.skill || "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{u.aadhaarNumber ? `${u.aadhaarNumber.slice(0, 4)}...${u.aadhaarNumber.slice(-4)}` : "—"}</td>
                  <td>{langMap[u.preferredLanguage] || u.preferredLanguage}</td>
                  <td>
                    <span className={`badge ${u.isOnboarded ? "badge-present" : "badge-pending"}`}>
                      {u.isOnboarded ? "Onboarded" : "Pending"}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No users found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {total > 20 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 20 }}>
          <button className="btn" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            ← Prev
          </button>
          <span style={{ alignSelf: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Page {page} of {Math.ceil(total / 20)}
          </span>
          <button className="btn" onClick={() => setPage(page + 1)} disabled={page >= Math.ceil(total / 20)}
            style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
