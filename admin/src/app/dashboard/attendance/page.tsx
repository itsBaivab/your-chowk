"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface AttendanceRecord {
  id: string;
  workerPhone: string;
  attendanceStatus: string;
  attendanceMarkedAt: string | null;
  status: string;
  worker: { name: string | null; phoneNumber: string; skill: string | null };
  job: { title: string | null; skillRequired: string; city: string; wage: string };
}

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/dashboard/attendance?page=${page}&limit=20`)
      .then((r) => r.json())
      .then((data) => { setRecords(data.records); setTotal(data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div>
      <h1 className="page-title">Attendance</h1>
      <p className="page-subtitle">OTP-verified attendance records</p>

      <div style={{ marginBottom: 24 }}>
        <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{total} records</span>
      </div>

      <div className="glass-card" style={{ overflow: "auto" }}>
        {loading ? (
          <div className="loading-container"><div className="spinner" /></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Phone</th>
                <th>Job</th>
                <th>City</th>
                <th>Wage</th>
                <th>Status</th>
                <th>Marked At</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.worker.name || "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{r.worker.phoneNumber}</td>
                  <td>{r.job.title || r.job.skillRequired}</td>
                  <td>{r.job.city}</td>
                  <td style={{ color: "var(--success)", fontWeight: 600 }}>{r.job.wage}</td>
                  <td>
                    <span className={`badge badge-${r.attendanceStatus.toLowerCase()}`}>
                      {r.attendanceStatus}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    {r.attendanceMarkedAt ? new Date(r.attendanceMarkedAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No attendance records found</td></tr>
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
