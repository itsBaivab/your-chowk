"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface Stats {
  totalWorkers: number;
  totalContractors: number;
  totalJobs: number;
  openJobs: number;
  filledJobs: number;
  totalApplications: number;
  acceptedApplications: number;
  attendanceMarked: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/dashboard/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    );
  }

  if (!stats) {
    return <p style={{ color: "var(--text-secondary)" }}>Failed to load stats. Is the backend running?</p>;
  }

  const cards = [
    { label: "Workers", value: stats.totalWorkers, icon: "👷" },
    { label: "Contractors", value: stats.totalContractors, icon: "🏢" },
    { label: "Total Jobs", value: stats.totalJobs, icon: "📋" },
    { label: "Open Jobs", value: stats.openJobs, icon: "🟢" },
    { label: "Filled Jobs", value: stats.filledJobs, icon: "✅" },
    { label: "Applications", value: stats.totalApplications, icon: "📩" },
    { label: "Accepted", value: stats.acceptedApplications, icon: "🤝" },
    { label: "Attendance", value: stats.attendanceMarked, icon: "📍" },
  ];

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Overview of Your Chawk labour marketplace</p>

      <div className="stats-grid">
        {cards.map((card) => (
          <div key={card.label} className="glass-card stat-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="stat-label">{card.label}</span>
              <span className="stat-icon">{card.icon}</span>
            </div>
            <span className="stat-value">{card.value}</span>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ padding: 32 }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: 16 }}>
          🏗️ Quick Summary
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: 8 }}>
              Job Fill Rate
            </p>
            <div style={{ background: "var(--bg-secondary)", borderRadius: 8, overflow: "hidden", height: 8 }}>
              <div
                style={{
                  width: `${stats.totalJobs ? (stats.filledJobs / stats.totalJobs) * 100 : 0}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, var(--accent), #a78bfa)",
                  borderRadius: 8,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
              {stats.totalJobs ? Math.round((stats.filledJobs / stats.totalJobs) * 100) : 0}% filled
            </p>
          </div>
          <div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: 8 }}>
              Application Accept Rate
            </p>
            <div style={{ background: "var(--bg-secondary)", borderRadius: 8, overflow: "hidden", height: 8 }}>
              <div
                style={{
                  width: `${stats.totalApplications ? (stats.acceptedApplications / stats.totalApplications) * 100 : 0}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, var(--success), #4ade80)",
                  borderRadius: 8,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
              {stats.totalApplications ? Math.round((stats.acceptedApplications / stats.totalApplications) * 100) : 0}% accepted
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
