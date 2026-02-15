"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface Job {
  id: string;
  contractorPhone: string;
  title: string | null;
  skillRequired: string;
  wage: string;
  city: string;
  location: string | null;
  workersNeeded: number;
  durationDays: number | null;
  insuranceProvided: boolean;
  status: string;
  createdAt: string;
  applications: { id: string; workerPhone: string; status: string }[];
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (statusFilter) params.set("status", statusFilter);

    fetch(`${API}/api/dashboard/jobs?${params}`)
      .then((r) => r.json())
      .then((data) => { setJobs(data.jobs); setTotal(data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  return (
    <div>
      <h1 className="page-title">Jobs</h1>
      <p className="page-subtitle">All posted jobs and their statuses</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {["", "OPEN", "FILLED", "CANCELLED"].map((s) => (
          <button
            key={s}
            className="btn"
            onClick={() => { setStatusFilter(s); setPage(1); }}
            style={{
              background: statusFilter === s ? "linear-gradient(135deg, var(--accent), #8b5cf6)" : "var(--bg-card)",
              color: statusFilter === s ? "white" : "var(--text-secondary)",
              border: `1px solid ${statusFilter === s ? "transparent" : "var(--border)"}`,
            }}
          >
            {s === "" ? "All" : s === "OPEN" ? "🟢 Open" : s === "FILLED" ? "✅ Filled" : "❌ Cancelled"}
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
                <th>Job</th>
                <th>Skill</th>
                <th>City</th>
                <th>Wage</th>
                <th>Workers</th>
                <th>Duration</th>
                <th>Insurance</th>
                <th>Status</th>
                <th>Apps</th>
                <th>Posted</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td style={{ fontWeight: 600 }}>{j.title || j.skillRequired}</td>
                  <td>{j.skillRequired}</td>
                  <td>{j.city}{j.location ? `, ${j.location}` : ""}</td>
                  <td style={{ fontWeight: 600, color: "var(--success)" }}>{j.wage}</td>
                  <td>{j.applications.filter((a) => a.status === "ACCEPTED").length}/{j.workersNeeded}</td>
                  <td>{j.durationDays ? `${j.durationDays}d` : "—"}</td>
                  <td>{j.insuranceProvided ? "✅" : "❌"}</td>
                  <td><span className={`badge badge-${j.status.toLowerCase()}`}>{j.status}</span></td>
                  <td>{j.applications.length}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    {new Date(j.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No jobs found</td></tr>
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
