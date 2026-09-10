import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Search, Download, Mail, Phone,
  GraduationCap, Building2, Fingerprint,
  CheckCircle2, Clock, MapPin, BarChart3, BookOpen,
  Award, ChevronDown, ChevronUp, Loader2, TrendingUp,
  Star, Eye, Filter, Video, FileText, CalendarCheck,
  Cpu, Globe, RefreshCw, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fetchWithAuth } from "@/lib/api";
import { toast } from "sonner";
import { SyncDataButton } from "./data/SyncDataButton";

// ── Leaflet (same pattern as UserManagement.tsx) ─────────────────────────────
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;
 
const formatTime = (timeStr?: string) => {
  if (!timeStr) return "—";
  if (timeStr.includes("AM") || timeStr.includes("PM")) return timeStr;
  try {
    const [hStr, mStr] = timeStr.split(":");
    const h = parseInt(hStr);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mStr} ${ampm}`;
  } catch {
    return timeStr;
  }
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentProfile {
  id: string;         // profile._id — used for display + cache key
  user_id?: string;   // actual user_id (for API calls)
  full_name: string | null;
  email: string | null;
  mobile_number?: string | null;
  college_name?: string | null;
  institute_name?: string | null;
  full_address?: string | null;
  city?: string | null;
  district?: string | null;
  country?: string | null;
  role?: string;
  approval_status?: string;
  is_approved?: boolean;
  avatar_url?: string | null;
  created_at?: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface CourseEntry {
  course_name?: string;
  progress?: number;
  status?: string;
  user_id?: string;
  progress_percentage?: number;
}

interface QuestionSnap {
  question_id: string;
  question_text: string;
  type: string;
  marks: number;
  correct_answer?: string;
  student_answer?: string;
}

interface ResultEntry {
  result_id?: string;
  title?: string;
  exam_name?: string;
  score?: number;
  total?: number;
  percentage?: number;
  date?: string;
  passed?: boolean;
  grading_status?: string;
  answers?: Record<string, string>;
  questions_snapshot?: QuestionSnap[];
}

interface PerformanceData {
  enrollments: CourseEntry[];
  results: ResultEntry[];
  github_url?: string;
  resume_url?: string;
}

interface AttendanceRecord {
  id?: string;
  date?: string;
  day?: string;
  time?: string;
  timestamp?: string;
}

interface LiveSession {
  title?: string;
  topic?: string;
  start_time?: string;
  status?: string;
  duration?: number;
}

interface ResourceData {
  title?: string;
  type?: string;
  file_url?: string;
}

interface ResumeATS {
  ats_score?: number;
  score?: number;
  job_title?: string;
  skills?: string[];
  feedback?: string;
  created_at?: string;
}

interface StudentDetail {
  performance: PerformanceData | null;
  attendance: AttendanceRecord[];
  live_sessions: LiveSession[];
  resources: ResourceData[];
  resume_ats: ResumeATS | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sv = (v: string | null | undefined) => v || "—";
const sd = (s?: string) => (s ? new Date(s).toLocaleDateString("en-GB") : "—");
const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
  try { return await fn(); } catch { return null; }
};

// ─── PDF builder — 4 clean pages ─────────────────────────────────────────────

function buildPDF(profile: StudentProfile, detail: StudentDetail): string {
  const name = sv(profile.full_name);
  const email = sv(profile.email);
  const mobile = sv(profile.mobile_number);
  const college = sv(profile.college_name);
  const institute = sv(profile.institute_name);
  const joined = sd(profile.created_at);
  const status = profile.is_approved ? "Approved" : "Pending";
  const lat = profile.latitude;
  const lng = profile.longitude;

  const enrollments = detail.performance?.enrollments || [];
  const results = detail.performance?.results || [];
  const attendance = detail.attendance || [];
  const live = detail.live_sessions || [];
  const resources = detail.resources || [];
  const ats = detail.resume_ats;

  const avgScore =
    results.length > 0
      ? Math.round(
          results.reduce((a, r) => {
            const pct = r.percentage ?? (r.score && r.total ? Math.round((r.score / r.total) * 100) : 0);
            return a + pct;
          }, 0) / results.length
        )
      : null;

  const atsScore = ats?.ats_score ?? ats?.score ?? null;

  const css = `
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;background:#fff;font-size:11px;line-height:1.5;}
    .cover{min-height:100vh;background:linear-gradient(145deg,#1e1b4b,#312e81 40%,#4338ca);display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px;color:#fff;text-align:center;}
    .c-logo{width:80px;height:80px;background:rgba(255,255,255,0.15);border-radius:24px;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:900;margin:0 auto 28px;border:2px solid rgba(255,255,255,0.3);}
    .c-title{font-size:40px;font-weight:900;letter-spacing:-1px;margin-bottom:8px;}
    .c-sub{font-size:13px;opacity:.6;letter-spacing:4px;text-transform:uppercase;margin-bottom:44px;}
    .c-divider{width:60px;height:3px;background:rgba(255,255,255,.35);margin:0 auto 36px;border-radius:2px;}
    .c-card{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);border-radius:20px;padding:32px 44px;backdrop-filter:blur(12px);}
    .c-name{font-size:26px;font-weight:900;margin-bottom:6px;}
    .c-email{font-size:12px;opacity:.7;margin-bottom:24px;}
    .c-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
    .c-chip{background:rgba(255,255,255,.15);border-radius:12px;padding:12px 16px;}
    .c-chip .v{font-size:20px;font-weight:900;}
    .c-chip .l{font-size:8px;opacity:.6;text-transform:uppercase;letter-spacing:2px;margin-top:2px;}
    .c-foot{margin-top:36px;font-size:9px;opacity:.4;}
    .page{padding:40px 48px;page-break-before:always;}
    .ph{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #e2e8f0;padding-bottom:14px;margin-bottom:24px;}
    .ph-title{font-size:20px;font-weight:900;color:#1e293b;}
    .ph-sub{font-size:9px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin-top:2px;}
    .ph-badge{background:#eef2ff;color:#4338ca;padding:4px 14px;border-radius:20px;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:2px;}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;}
    .stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;}
    .stat .v{font-size:22px;font-weight:900;color:#4338ca;}
    .stat .l{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-top:2px;}
    .sec{margin-bottom:22px;}
    .sec-title{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#6366f1;margin-bottom:10px;display:flex;align-items:center;gap:6px;}
    .sec-title::before{content:'';display:inline-block;width:3px;height:11px;background:#6366f1;border-radius:2px;}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
    .info-item{background:#f8fafc;border-radius:8px;padding:9px 12px;border:1px solid #e2e8f0;}
    .info-item .lbl{font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:2px;}
    .info-item .val{font-size:11px;font-weight:700;color:#1e293b;}
    .info-item .val.mono{font-family:'Courier New',monospace;font-size:9px;}
    table{width:100%;border-collapse:collapse;}
    thead th{background:#f1f5f9;padding:8px 10px;text-align:left;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;border-bottom:2px solid #e2e8f0;}
    tbody td{padding:9px 10px;border-bottom:1px solid #f1f5f9;font-size:10px;color:#374151;vertical-align:top;}
    tbody tr:nth-child(even) td{background:#fafafa;}
    .pb{height:5px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin-top:3px;}
    .pf{height:100%;border-radius:4px;}
    .bj{display:inline-block;padding:2px 8px;border-radius:20px;font-size:7px;font-weight:900;text-transform:uppercase;}
    .bg{background:#f0fdf4;color:#16a34a;}
    .ba{background:#fffbeb;color:#d97706;}
    .br{background:#fff1f2;color:#e11d48;}
    .bb{background:#eff6ff;color:#2563eb;}
    .map-box{background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;display:flex;align-items:center;gap:14px;}
    .map-pin{width:36px;height:36px;background:#3b82f6;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .empty{background:#f8fafc;border:1px dashed #e2e8f0;border-radius:10px;padding:18px;text-align:center;color:#94a3b8;font-size:10px;font-weight:700;}
    .ats-box{background:linear-gradient(135deg,#ecfdf5,#f0fdf4);border:2px solid #bbf7d0;border-radius:14px;padding:20px;display:flex;align-items:center;gap:20px;}
    .ats-score{width:72px;height:72px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:900;border:4px solid;flex-shrink:0;}
    .ats-score .sv{font-size:24px;}
    .ats-score .sl{font-size:8px;opacity:.7;}
    .foot{text-align:center;font-size:8px;color:#94a3b8;border-top:1px solid #f1f5f9;margin-top:28px;padding-top:12px;}
    @media print{.cover,.page{-webkit-print-color-adjust:exact;print-color-adjust:exact;}thead th{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.stat{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.ats-box{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  `;

  const enrollRows = enrollments
    .map(e => {
      const p = e.progress ?? 0;
      const pc = p >= 75 ? "#22c55e" : p >= 40 ? "#f59e0b" : "#6366f1";
      return `<tr><td><strong>${sv(e.course_name)}</strong></td><td><span class="bj ${e.status === "active" ? "bg" : "ba"}">${e.status || "—"}</span></td><td>${p}%<div class="pb"><div class="pf" style="width:${p}%;background:${pc};"></div></div></td></tr>`;
    })
    .join("");

  const examRows = results
    .map(r => {
      const pct = r.percentage ?? (r.score && r.total ? Math.round((r.score / r.total) * 100) : null);
      const pass = pct !== null && pct >= 60;
      return `<tr><td><strong>${sv(r.title || r.exam_name)}</strong></td><td>${r.score ?? "—"}/${r.total ?? "—"}</td><td>${pct !== null ? pct + "%" : "—"}${pct !== null ? `<div class="pb"><div class="pf" style="width:${pct}%;background:${pass ? "#22c55e" : "#f43f5e"};"></div></div>` : ""}</td><td><span class="bj ${pass ? "bg" : "br"}">${pass ? "Passed" : "Failed"}</span></td><td style="font-size:9px;color:#94a3b8;">${sd(r.date)}</td></tr>`;
    })
    .join("");

  const attRows = attendance
    .map(a => `<tr><td>${sd(a.date || a.timestamp)}</td><td>${a.day || "—"}</td><td>${a.time || "—"}</td><td><span class="bj bg">Present</span></td></tr>`)
    .join("");

  const liveRows = live
    .map(l => `<tr><td><strong>${sv(l.title || l.topic)}</strong></td><td><span class="bj ${l.status === "live" ? "br" : l.status === "ended" ? "bb" : "ba"}">${l.status || "scheduled"}</span></td><td style="color:#94a3b8;font-size:9px;">${sd(l.start_time)}</td><td>${l.duration ? l.duration + " min" : "—"}</td></tr>`)
    .join("");

  const resRows = resources
    .map(r => `<tr><td><strong>${sv(r.title)}</strong></td><td>${r.type ? `<span class="bj bb">${r.type}</span>` : "—"}</td></tr>`)
    .join("");

  const atsColor = atsScore !== null ? (atsScore >= 70 ? "#16a34a" : atsScore >= 50 ? "#d97706" : "#dc2626") : "#94a3b8";
  const atsBg = atsScore !== null ? (atsScore >= 70 ? "#dcfce7" : atsScore >= 50 ? "#fef3c7" : "#fee2e2") : "#f1f5f9";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Report — ${name}</title><style>${css}</style></head><body>

<!-- PAGE 1: COVER -->
<div class="cover">
  <div class="c-logo">${name[0] || "S"}</div>
  <div class="c-title">Student Report</div>
  <div class="c-sub">AOTMS — Academy of Tech Masters</div>
  <div class="c-divider"></div>
  <div class="c-card">
    <div class="c-name">${name}</div>
    <div class="c-email">${email} &nbsp;•&nbsp; ${mobile}</div>
    <div class="c-grid">
      <div class="c-chip"><div class="v">${status}</div><div class="l">Status</div></div>
      <div class="c-chip"><div class="v">${enrollments.length}</div><div class="l">Courses</div></div>
      <div class="c-chip"><div class="v">${avgScore !== null ? avgScore + "%" : "—"}</div><div class="l">Avg Score</div></div>
      <div class="c-chip"><div class="v">${results.length}</div><div class="l">Exams</div></div>
      <div class="c-chip"><div class="v">${attendance.length}</div><div class="l">Attendance</div></div>
      <div class="c-chip"><div class="v">${atsScore !== null ? atsScore + "/100" : "—"}</div><div class="l">ATS Score</div></div>
    </div>
  </div>
  <div class="c-foot">Confidential &nbsp;|&nbsp; ${new Date().toLocaleString("en-IN")} &nbsp;|&nbsp; AOTMS Admin Panel</div>
</div>

<!-- PAGE 2: Identity + Location + Courses -->
<div class="page">
  <div class="ph">
    <div><div class="ph-title">Identity &amp; Courses</div><div class="ph-sub">Page 2 of 4 &nbsp;•&nbsp; Profile Details &amp; Enrollment</div></div>
    <div class="ph-badge">AOTMS</div>
  </div>
  <div class="stats">
    <div class="stat"><div class="v">${enrollments.length}</div><div class="l">Enrolled</div></div>
    <div class="stat"><div class="v">${results.length}</div><div class="l">Exams Done</div></div>
    <div class="stat"><div class="v">${attendance.length}</div><div class="l">Attendance</div></div>
    <div class="stat"><div class="v">${atsScore ?? "—"}</div><div class="l">ATS Score</div></div>
  </div>
  <div class="sec">
    <div class="sec-title">Personal Information</div>
    <div class="info-grid">
      <div class="info-item"><div class="lbl">Full Name</div><div class="val">${name}</div></div>
      <div class="info-item"><div class="lbl">Email</div><div class="val">${email}</div></div>
      <div class="info-item"><div class="lbl">Mobile</div><div class="val">${mobile}</div></div>
      <div class="info-item"><div class="lbl">College</div><div class="val">${college}</div></div>
      <div class="info-item"><div class="lbl">Institute</div><div class="val">${institute}</div></div>
      <div class="info-item"><div class="lbl">Status</div><div class="val"><span class="bj ${status === "Approved" ? "bg" : "ba"}">${status}</span></div></div>
      <div class="info-item"><div class="lbl">Joined</div><div class="val">${joined}</div></div>
      <div class="info-item"><div class="lbl">UUID</div><div class="val mono">${profile.id}</div></div>
    </div>
  </div>
  <div class="sec">
    <div class="sec-title">Registration Location</div>
    ${lat && lng
      ? `<div class="map-box"><div class="map-pin"><svg width="20" height="20" fill="white" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div><div><div style="font-size:12px;font-weight:800;color:#1e40af;">${lat.toFixed(6)}, ${lng.toFixed(6)}</div><div style="font-size:9px;color:#3b82f6;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-top:3px;">GPS Coordinates Captured</div></div></div>`
      : `<div class="empty">📍 No GPS location data recorded</div>`}
  </div>
  <div class="sec">
    <div class="sec-title">Enrolled Courses (${enrollments.length})</div>
    ${enrollments.length > 0
      ? `<table><thead><tr><th>Course</th><th>Status</th><th>Progress</th></tr></thead><tbody>${enrollRows}</tbody></table>`
      : `<div class="empty">📚 No courses enrolled yet</div>`}
  </div>
  <div class="foot">AOTMS — ${name} &nbsp;|&nbsp; Page 2</div>
</div>

<!-- PAGE 3: Exams + Attendance -->
<div class="page">
  <div class="ph">
    <div><div class="ph-title">Academics</div><div class="ph-sub">Page 3 of 4 &nbsp;•&nbsp; Exam Results &amp; Attendance</div></div>
    <div class="ph-badge">AOTMS</div>
  </div>
  <div class="sec">
    <div class="sec-title">Exam Results (${results.length})${avgScore !== null ? `  —  Avg ${avgScore}%` : ""}</div>
    ${results.length > 0
      ? `<table><thead><tr><th>Exam / Assessment</th><th>Score</th><th>Percentage</th><th>Result</th><th>Date</th></tr></thead><tbody>${examRows}</tbody></table>`
      : `<div class="empty">📝 No exam records found</div>`}
  </div>
  <div class="sec">
    <div class="sec-title">Attendance Log (${attendance.length} days present)</div>
    ${attendance.length > 0
      ? `<table><thead><tr><th>Date</th><th>Day</th><th>Time</th><th>Status</th></tr></thead><tbody>${attRows}</tbody></table>`
      : `<div class="empty">📅 No attendance records found</div>`}
  </div>
  <div class="foot">AOTMS — ${name} &nbsp;|&nbsp; Page 3</div>
</div>

<!-- PAGE 4: Live + Resources + ATS -->
<div class="page">
  <div class="ph">
    <div><div class="ph-title">Activity &amp; ATS</div><div class="ph-sub">Page 4 of 4 &nbsp;•&nbsp; Sessions, Resources &amp; Resume ATS</div></div>
    <div class="ph-badge">AOTMS</div>
  </div>
  <div class="sec">
    <div class="sec-title">Live Sessions (${live.length})</div>
    ${live.length > 0
      ? `<table><thead><tr><th>Session</th><th>Status</th><th>Date</th><th>Duration</th></tr></thead><tbody>${liveRows}</tbody></table>`
      : `<div class="empty">📹 No live session records</div>`}
  </div>
  <div class="sec">
    <div class="sec-title">Resources (${resources.length})</div>
    ${resources.length > 0
      ? `<table><thead><tr><th>Resource</th><th>Type</th></tr></thead><tbody>${resRows}</tbody></table>`
      : `<div class="empty">📁 No resources found</div>`}
  </div>
  <div class="sec">
    <div class="sec-title">Resume ATS Analysis</div>
    ${ats
      ? `<div class="ats-box">
          <div class="ats-score" style="background:${atsBg};border-color:${atsColor};color:${atsColor};">
            <div class="sv">${atsScore ?? "—"}</div><div class="sl">/100</div>
          </div>
          <div style="flex:1;">
            <div style="font-size:16px;font-weight:900;color:${atsColor};margin-bottom:5px;">${atsScore !== null ? (atsScore >= 70 ? "Strong Profile" : atsScore >= 50 ? "Moderate" : "Needs Work") : "—"}</div>
            ${ats.job_title ? `<div style="font-size:10px;color:#64748b;margin-bottom:6px;">Target: <strong>${ats.job_title}</strong></div>` : ""}
            ${ats.skills?.length ? `<div style="font-size:9px;color:#64748b;">Skills: <strong>${ats.skills.slice(0,8).join(", ")}</strong></div>` : ""}
            ${ats.feedback ? `<div style="font-size:9px;color:#64748b;font-style:italic;margin-top:5px;">${ats.feedback}</div>` : ""}
          </div>
        </div>`
      : `<div class="empty">🤖 No resume ATS scan found</div>`}
  </div>
  <div class="foot"><strong>AOTMS — Academy of Tech Masters</strong><br/>Confidential Student Report &nbsp;|&nbsp; ${name} &nbsp;|&nbsp; ${new Date().toLocaleString("en-IN")}</div>
</div>

</body></html>`;
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

function Sec({
  icon: I, title, color, count, children, empty,
}: {
  icon: React.ComponentType<{ className?: string }> | any; title: string;
  color: string; count?: number;
  children?: React.ReactNode; empty: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${color}`}>
          <I className="h-3 w-3" /> {title}
        </span>
        {count !== undefined && (
          <Badge className="bg-slate-100 text-slate-400 border-none text-[8px] font-black px-2">{count}</Badge>
        )}
      </div>
      {count === 0
        ? <div className="py-5 text-center">
            <I className="h-7 w-7 text-slate-100 mx-auto mb-1" />
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{empty}</p>
          </div>
        : children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface StudentPerformanceProps {
  enrollments?: CourseEntry[];
  onSync?: () => void;
  loading?: boolean;
}

export function StudentPerformance({ 
  enrollments: bulkEnrollments = [],
  onSync,
  loading: parentLoading = false
}: StudentPerformanceProps) {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fCollege, setFCollege] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, StudentDetail>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expandedExamKey, setExpandedExamKey] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => { loadStudents(); }, []);

  // ── Load students using the same endpoint as UserManagement (/admin/users)
  // This ensures the count ALWAYS matches between "User Management" and "Academic Scores"
  // because /admin/users joins User + Profile + UserRole (only real registered users).
  // The old approach (/data/profiles + /data/user_roles) would include orphaned profiles
  // that have no User credential, defaulting them to "student" and inflating the count.
  const loadStudents = async (showToast = false) => {
    setLoading(true);
    setIsSyncing(true);
    // Clear cached detail data so fresh avatars and scores are loaded
    setDetailCache({});
    setExpandedId(null);
    setExpandedExamKey(null);
    try {
      // /admin/users returns merged User+Profile+UserRole data — same source as UserManagement
      const usersData = await fetchWithAuth<StudentProfile[]>("/admin/students");
      const studentsOnly = (usersData || []).filter(u => u.role === 'student' || u.role === 'intern' || !u.role);
      // Map to expected shape (admin/students returns user records with profile joined)
      const mapped = studentsOnly.map(u => ({
        ...u,
        is_approved: u.approval_status === "approved",
        role: u.role || "student",
      }));
      setStudents(mapped);
      if (showToast) toast.success("Performance data synchronized");
    } catch {
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  // ── Fetch all detail — always fetch fresh (no stale cache) ─────────
  const fetchDetail = async (profile: StudentProfile): Promise<StudentDetail> => {
    const uid = profile.id;

    const [perfRaw, attendanceRaw, liveRaw, resourcesRaw, atsRaw] = await Promise.all([
      safe(() => fetchWithAuth<PerformanceData>(`/admin/student-performance/${uid}`)),
      safe(() => fetchWithAuth<AttendanceRecord[]>(`/admin/attendance/${uid}`)),
      safe(() => fetchWithAuth<LiveSession[]>(`/data/live_classes?limit=50`)),
      safe(() => fetchWithAuth<ResourceData[]>(`/data/course_resources?limit=50`)),
      safe(() => fetchWithAuth<ResumeATS[]>(`/data/resumescans?user_id=${uid}&limit=1`)),
    ]);

    // Debug: log what results came back
    console.log('[StudentHub] results for', profile.full_name, ':', perfRaw?.results?.map(r => ({
      title: r.title,
      qs_count: r.questions_snapshot?.length,
      ans_count: Object.keys(r.answers || {}).length
    })));

    const detail: StudentDetail = {
      performance: perfRaw,
      attendance: attendanceRaw || [],
      live_sessions: liveRaw || [],
      resources: resourcesRaw || [],
      resume_ats: Array.isArray(atsRaw) && atsRaw.length > 0 ? atsRaw[0] : null,
    };
    setDetailCache(prev => ({ ...prev, [profile.id]: detail }));
    return detail;
  };



  const toggleExpand = async (p: StudentProfile) => {
    if (expandedId === p.id) { setExpandedId(null); return; }
    setExpandedId(p.id);
    // Always re-fetch to get latest Q&A data (no stale cache)
    setLoadingId(p.id);
    await fetchDetail(p).catch(() => {});
    setLoadingId(null);
  };

  const downloadPdf = async (e: React.MouseEvent, profile: StudentProfile) => {
    e.stopPropagation();
    setDownloadingId(profile.id);
    try {
      const detail = await fetchDetail(profile);
      const html = buildPDF(profile, detail);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (w) w.onload = () => setTimeout(() => w.print(), 700);
      toast.success(`Report ready — ${profile.full_name}`);
    } catch {
      toast.error("PDF failed");
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Filter ────────────────────────────────────────────────────────────────────
  const uniqueColleges = Array.from(
    new Set(students.map(s => sv(s.college_name)).filter(v => v !== "—"))
  ).sort();

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (s.full_name || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      (s.mobile_number || "").includes(q);
    const matchStatus =
      fStatus === "all" || (fStatus === "approved" ? s.is_approved : !s.is_approved);
    const matchCollege = fCollege === "all" || sv(s.college_name) === fCollege;
    return matchSearch && matchStatus && matchCollege;
  });

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-7 animate-in fade-in duration-500">

      {/* Header */}
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-[2rem] bg-slate-900 flex items-center justify-center shadow-2xl shadow-slate-200 ring-4 ring-white">
            <BarChart3 className="h-8 w-8 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 leading-none">Student Hub</h1>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
               <span className="h-1 w-4 bg-primary rounded-full" /> Platform Registry V.2
            </p>
          </div>
        </div>
        
        <SyncDataButton 
          onSync={onSync || (() => loadStudents(true))}
          isLoading={parentLoading || isSyncing}
          className="h-12 px-6 shadow-xl shadow-indigo-200/50"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: students.length, icon: Users, bg: "bg-indigo-50", c: "text-indigo-600" },
          { label: "Approved", value: students.filter(s => s.is_approved).length, icon: CheckCircle2, bg: "bg-emerald-50", c: "text-emerald-600" },
          { label: "Pending", value: students.filter(s => !s.is_approved).length, icon: Clock, bg: "bg-amber-50", c: "text-amber-600" },
          { label: "Filtered", value: filtered.length, icon: Filter, bg: "bg-violet-50", c: "text-violet-600" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="border-none shadow-xl shadow-slate-200/40 rounded-2xl bg-white">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.c}`} />
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900">{loading ? "…" : s.value}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      {/* Advanced Filters */}
      <div className="flex flex-col sm:flex-row gap-4 p-5 bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/30">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
          <Input
            placeholder="Search registry by name, email or mobile..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-12 h-12 bg-slate-50 border-none rounded-2xl font-bold text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-900/10 placeholder:text-slate-400/70"
          />
        </div>
        <div className="flex gap-3">
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="h-12 w-40 rounded-2xl bg-slate-50 border-none font-black text-[11px] uppercase tracking-tighter shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-slate-100 shadow-2xl">
              <SelectItem value="all" className="font-bold text-xs py-3">ALL STATUS</SelectItem>
              <SelectItem value="approved" className="font-bold text-xs py-3">APPROVED</SelectItem>
              <SelectItem value="pending" className="font-bold text-xs py-3">PENDING</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fCollege} onValueChange={setFCollege}>
            <SelectTrigger className="h-12 min-w-52 rounded-2xl bg-slate-50 border-none font-black text-[11px] uppercase tracking-tighter shadow-sm">
              <SelectValue placeholder="College" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-slate-100 shadow-2xl max-h-80">
              <SelectItem value="all" className="font-bold text-xs py-3">ALL COLLEGES</SelectItem>
              {uniqueColleges.map(c => (
                <SelectItem key={c} value={c} className="font-bold text-xs py-3">{c.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Student List */}
      <Card className="border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] rounded-[3rem] overflow-hidden bg-white">
        <CardHeader className="px-8 py-7 border-b border-slate-50 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-lg">
                <Users className="h-5 w-5" />
              </div>
              ACADEMIC SCORES DIRECTORY
            </CardTitle>
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-2xl shadow-sm border border-slate-100">
               <span className="animate-pulse h-2 w-2 rounded-full bg-emerald-500" />
               <span className="text-[11px] font-black tracking-widest text-slate-500 uppercase">{filtered.length} ACTIVE RECORDS</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 rounded-2xl bg-slate-50 animate-pulse border border-slate-100" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Search className="h-10 w-10 text-slate-200 mb-3" />
              <p className="text-sm font-black text-slate-300 uppercase tracking-widest">No students found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50/80">
              <AnimatePresence>
                {filtered.map((stu, idx) => {
                  const isExp = expandedId === stu.id;
                  const isLoadingThis = loadingId === stu.id;
                  const isDown = downloadingId === stu.id;
                  const detail = detailCache[stu.id];

                  // Performance summary from detail cache
                  const enrollments = detail?.performance?.enrollments || [];
                  const results = detail?.performance?.results || [];
                  const attendance = detail?.attendance || [];

                  // Quick summary from props or profile
                  const myBulk = bulkEnrollments.filter(e => e.user_id === stu.user_id);
                  const coursesCount = myBulk.length > 0 ? myBulk.length : (enrollments.length || 0);

                  return (
                    <motion.div
                      key={stu.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx, 15) * 0.02 }}
                    >
                      {/* ── Row ── */}
                      <div
                        className={`flex flex-col sm:flex-row items-center gap-4 px-6 py-6 cursor-pointer group transition-all ${isExp ? "bg-slate-50" : "hover:bg-slate-50/50"}`}
                        onClick={() => toggleExpand(stu)}
                      >
                        {/* Avatar & Identifiers Row */}
                        <div className="flex items-center gap-4 w-full sm:w-auto flex-1 min-w-0">
                          <div className="relative flex-shrink-0 group-hover:scale-110 transition-transform duration-500">
                            <Avatar className="h-16 w-16 sm:h-20 sm:w-20 rounded-[2rem] border-4 border-white shadow-xl overflow-hidden ring-1 ring-slate-100">
                              <AvatarImage src={stu.avatar_url || ""} className="object-cover" />
                              <AvatarFallback className="bg-slate-900 text-white font-black text-xl sm:text-2xl rounded-[2rem]">
                                {stu.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-4 border-white shadow-md flex items-center justify-center ${stu.is_approved ? "bg-slate-900" : "bg-amber-500"}`}>
                               <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                            </div>
                          </div>

                          <div className="flex-1 min-w-0 space-y-1.5">
                            <p className="font-black text-slate-900 text-xl sm:text-2xl leading-[0.9] tracking-tight group-hover:text-slate-700 transition-colors truncate">
                              {stu.full_name || "UNNAMED STUDENT"}
                            </p>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-2">
                              <span className="text-[11px] text-slate-500 font-bold flex items-center gap-2 truncate uppercase tracking-widest">
                                <Mail className="h-3 w-3 opacity-40 shrink-0" />{stu.email}
                              </span>
                              {stu.mobile_number && (
                                <span className="text-[11px] text-slate-500 font-bold flex items-center gap-2 uppercase tracking-widest">
                                  <Phone className="h-3 w-3 opacity-40 shrink-0" />{stu.mobile_number}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 pt-1 flex-wrap">
                              {stu.college_name && stu.college_name.trim() !== "" && stu.college_name !== "—" && (
                                 <Badge className="bg-slate-100 hover:bg-slate-200 text-slate-600 border-none font-black text-[9px] px-3 py-1 rounded-full uppercase tracking-widest transition-colors">
                                    {stu.college_name.toUpperCase()}
                                 </Badge>
                              )}
                              {stu.institute_name && stu.institute_name.trim() !== "" && stu.institute_name !== "—" && (
                                 <Badge className="bg-slate-900 hover:bg-slate-800 text-white border-none font-black text-[9px] px-3 py-1 rounded-full uppercase tracking-widest transition-colors">
                                    {stu.institute_name.toUpperCase()}
                                 </Badge>
                              )}
                              {(!stu.college_name || stu.college_name.trim() === "" || stu.college_name === "—") && 
                               (!stu.institute_name || stu.institute_name.trim() === "" || stu.institute_name === "—") && (
                                 <Badge className="bg-slate-100 hover:bg-slate-200 text-slate-400 border-none font-black text-[9px] px-3 py-1 rounded-full uppercase tracking-widest transition-colors">
                                    —
                                 </Badge>
                              )}
                              {/* Role badge — always show INTERN or STUDENT */}
                              <Badge className={`border-none font-black text-[9px] px-3 py-1 rounded-full uppercase tracking-widest ${stu.role === 'intern' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                {stu.role === 'intern' ? '🎓 Intern' : 'Student'}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Metrics Row */}
                        <div className="grid grid-cols-2 lg:flex items-center gap-4 sm:gap-8 w-full sm:w-auto flex-shrink-0 pt-4 sm:pt-0 border-t sm:border-none border-slate-100">
                          <div className="flex flex-col items-start sm:items-center px-4 py-2 bg-slate-50 sm:bg-transparent rounded-2xl">
                            <span className="text-xl sm:text-2xl font-black text-slate-900 leading-none">{coursesCount}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Courses</span>
                          </div>

                          <div className="flex flex-col items-start sm:items-center px-4 py-2 bg-slate-50 sm:bg-transparent rounded-2xl">
                             <Badge className={`text-[10px] h-6 font-black border-none px-3 rounded-full uppercase tracking-widest shadow-sm ${stu.is_approved ? "bg-slate-900 text-white" : "bg-amber-500 text-white"}`}>
                                {stu.is_approved ? "Active" : "Pending"}
                             </Badge>
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 hidden sm:block">STATUS</span>
                          </div>

                          {/* Expansion & Download */}
                          <div className="flex items-center justify-end gap-3 col-span-2 sm:col-span-1 border-t pt-4 sm:pt-0 sm:border-none mt-2 sm:mt-0">
                            <Button
                              size="lg"
                              onClick={e => downloadPdf(e, stu)}
                              disabled={isDown}
                              className="h-12 w-12 sm:h-14 sm:w-14 p-0 rounded-[1.2rem] bg-slate-900 hover:bg-black text-white shadow-xl shadow-slate-200 transition-all active:scale-95 group/dl"
                              title="Download Performance Report"
                            >
                              {isDown ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5 group-hover/dl:scale-110 transition-transform" />}
                            </Button>
                            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-[1.2rem] bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 group-hover:bg-slate-900 group-hover:text-white transition-all transition-colors">
                               {isLoadingThis
                                  ? <Loader2 className="h-5 w-5 animate-spin" />
                                  : isExp
                                    ? <ChevronUp className="h-6 w-6" />
                                    : <ChevronDown className="h-6 w-6" />
                               }
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── Expanded Panel ── */}
                      <AnimatePresence>
                        {isExp && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="px-6 pb-10 pt-4 bg-slate-50/50 border-t border-slate-100">
                              {isLoadingThis ? (
                                <div className="flex flex-col items-center justify-center gap-4 py-20">
                                  <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-sm border border-slate-100">
                                    <Loader2 className="h-6 w-6 animate-spin text-slate-900" />
                                  </div>
                                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Mapping Student Portfolio...</p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-4">

                                  {/* 1. Personal Info */}
                                  <Sec icon={Eye} title="Identity Dashboard" color="text-slate-900" empty="">
                                    <div className="space-y-4 pt-2">
                                      {(() => {
                                        interface IdentityItem {
                                          l: string;
                                          v: string | null | undefined;
                                          icon: React.ComponentType<{ className?: string }> | any;
                                          mono?: boolean;
                                        }
                                        const items: IdentityItem[] = [
                                          { l: "Full Name", v: stu.full_name, icon: Users },
                                          { l: "Email Address", v: stu.email, icon: Mail },
                                          { l: "Contact No", v: stu.mobile_number, icon: Phone },
                                          { l: "College Det.", v: stu.college_name, icon: GraduationCap },
                                          { l: "Institute", v: stu.institute_name, icon: Building2 },
                                          { l: "Joined On", v: sd(stu.created_at), icon: Clock },
                                          { l: "Platform UUID", v: stu.id, icon: Fingerprint, mono: true },
                                        ];
                                        return items.map(item => (
                                          <div key={item.l} className="flex items-start gap-4 pb-3 border-b border-slate-50 last:border-none">
                                            <div className="h-8 w-8 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                                              <item.icon className="h-3.5 w-3.5 text-slate-400" />
                                            </div>
                                            <div className="min-w-0">
                                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{item.l}</p>
                                              <p className={`text-[12px] font-bold text-slate-800 break-all ${item.mono ? "font-mono text-[10px]" : ""}`}>
                                                {sv(item.v)}
                                              </p>
                                            </div>
                                          </div>
                                        ));
                                      })()}
                                    </div>
                                  </Sec>

                                  {/* 2. Map & GPS */}
                                  <Sec icon={MapPin} title="GPS Authentication" color="text-slate-900" count={stu.latitude && stu.longitude ? 1 : 0} empty="No Location Data Registered">
                                    {stu.latitude && stu.longitude && (
                                      <div className="space-y-4 pt-2">
                                        <div className="h-[200px] w-full rounded-2xl overflow-hidden border border-slate-100 shadow-sm relative z-0">
                                          <MapContainer
                                            center={[stu.latitude, stu.longitude]}
                                            zoom={13}
                                            scrollWheelZoom={false}
                                            className="h-full w-full grayscale contrast-125"
                                          >
                                            <TileLayer
                                              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <Marker position={[stu.latitude, stu.longitude]}>
                                              <Popup>
                                                <div className="text-xs font-bold font-display">
                                                  VERIFIED LOCATION<br />
                                                  <span className="text-[10px] font-normal text-slate-500">{stu.full_address}</span>
                                                </div>
                                              </Popup>
                                            </Marker>
                                          </MapContainer>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">LATITUDE</p>
                                            <p className="text-xs font-black text-slate-900">{stu.latitude.toFixed(6)}</p>
                                          </div>
                                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">LONGITUDE</p>
                                            <p className="text-xs font-black text-slate-900">{stu.longitude.toFixed(6)}</p>
                                          </div>
                                        </div>
                                        <Button
                                           variant="ghost"
                                           onClick={() => window.open(`https://maps.google.com/?q=${stu.latitude},${stu.longitude}`, '_blank')}
                                           className="w-full h-11 rounded-2xl border border-slate-100 text-[10px] font-black uppercase tracking-widest gap-2 bg-white hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                                        >
                                           <Globe className="h-3.5 w-3.5" /> Navigate via Maps
                                        </Button>
                                      </div>
                                    )}
                                  </Sec>


                                  {/* 4. Exams */}
                                  <Sec icon={Award} title="Academic Scores" color="text-slate-900" count={results.length} empty="No Assessments Found">
                                    <div className="space-y-3 pt-2 max-h-[600px] overflow-y-auto pr-1">
                                      {results.map((r, i) => {
                                        const pct = r.percentage ?? (r.score && r.total ? Math.round((r.score / r.total) * 100) : 0);
                                        const pass = pct >= 60;
                                        const qs = r.questions_snapshot || [];
                                        const examKey = `${stu.id}-exam-${i}`;
                                        const isExamOpen = expandedExamKey === examKey;
                                        return (
                                          <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                            {/* Clickable Score Header */}
                                            <button
                                              className="w-full p-4 text-left hover:bg-slate-50 transition-colors"
                                              onClick={() => setExpandedExamKey(isExamOpen ? null : examKey)}
                                            >
                                              <div className="flex items-center justify-between mb-2">
                                                <p className="text-xs font-black text-slate-900 truncate uppercase tracking-tighter flex-1">{sv(r.title || r.exam_name)}</p>
                                                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                                  <span className="text-[10px] font-black text-slate-400">{r.score || 0}/{r.total || 100}</span>
                                                  {qs.length > 0 && (
                                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border transition-colors ${
                                                      isExamOpen
                                                        ? 'bg-slate-900 text-white border-slate-900'
                                                        : 'bg-slate-50 text-slate-500 border-slate-200'
                                                    }`}>
                                                      {isExamOpen ? '▲ Hide' : '▼ Review'}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-3">
                                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                  <div className={`h-full rounded-full ${pass ? 'bg-slate-900' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
                                                </div>
                                                <Badge className={`text-[8px] font-black border-none px-2 py-0.5 rounded-full ${pass ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
                                                  {pass ? 'PASSED' : 'FAILED'}
                                                </Badge>
                                              </div>
                                              <div className="flex items-center justify-between mt-2">
                                                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">ASSESSED ON {sd(r.date)}</p>
                                                {qs.length > 0 && (
                                                  <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">{qs.length} Questions</p>
                                                )}
                                              </div>
                                            </button>

                                            {/* Expandable Q&A Dropdown */}
                                            <AnimatePresence>
                                              {isExamOpen && qs.length > 0 && (
                                                <motion.div
                                                  initial={{ height: 0, opacity: 0 }}
                                                  animate={{ height: 'auto', opacity: 1 }}
                                                  exit={{ height: 0, opacity: 0 }}
                                                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                                                  className="overflow-hidden"
                                                >
                                                  <div className="border-t border-slate-100 bg-slate-50/70 p-3 space-y-3">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 mb-2">
                                                      <FileText className="h-3 w-3" /> Questions & Answers ({qs.length})
                                                    </p>
                                                    {qs.map((q, qi) => {
                                                      const studentAns = q.student_answer || r.answers?.[q.question_id] || '';
                                                      const isCorrect = !!(studentAns && q.correct_answer &&
                                                        studentAns.trim().toLowerCase() === q.correct_answer.trim().toLowerCase());
                                                      return (
                                                        <div key={qi} className="bg-white rounded-xl border border-slate-100 p-3 space-y-2">
                                                          {/* Question */}
                                                          <div className="flex items-start gap-2">
                                                            <span className="h-5 w-5 rounded-full bg-slate-900 text-white text-[9px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">{qi + 1}</span>
                                                            <p className="text-[10px] font-bold text-slate-800 leading-relaxed">{q.question_text}</p>
                                                          </div>
                                                          {/* Answers */}
                                                          <div className="ml-7 space-y-1.5">
                                                            {/* Student Answer */}
                                                            <div className={`p-2 rounded-lg border text-[9px] font-bold ${
                                                              !studentAns
                                                                ? 'bg-slate-50 border-slate-100 text-slate-400'
                                                                : isCorrect
                                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                                                : 'bg-rose-50 border-rose-200 text-rose-800'
                                                            }`}>
                                                              <span className="font-black uppercase tracking-widest text-[7px] block mb-0.5 opacity-60">Student Answer:</span>
                                                              {studentAns || '— No answer provided —'}
                                                            </div>
                                                            {/* Correct Answer (only if wrong) */}
                                                            {q.correct_answer && !isCorrect && (
                                                              <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[9px] font-bold text-emerald-800">
                                                                <span className="font-black uppercase tracking-widest text-[7px] block mb-0.5 opacity-60">Correct Answer:</span>
                                                                {q.correct_answer}
                                                              </div>
                                                            )}
                                                            {/* Status + marks */}
                                                            <div className="flex items-center justify-between pt-0.5">
                                                              <Badge className={`text-[7px] font-black border-none px-2 py-0 rounded-full ${
                                                                isCorrect ? 'bg-emerald-100 text-emerald-700'
                                                                : studentAns ? 'bg-rose-100 text-rose-600'
                                                                : 'bg-slate-100 text-slate-400'
                                                              }`}>
                                                                {isCorrect ? '✓ Correct' : studentAns ? '✗ Wrong' : 'Skipped'}
                                                              </Badge>
                                                              <span className="text-[7px] font-black text-slate-300 uppercase">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                                                            </div>
                                                          </div>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </Sec>

                                  {/* 5. Attendance */}
                                  <Sec icon={CalendarCheck} title="Verified Attendance" color="text-slate-900" count={attendance.length} empty="Zero Log Entries">
                                    <div className="space-y-4 pt-2">
                                      <div className="flex items-center gap-4 p-4 bg-slate-900 rounded-2xl text-white shadow-xl shadow-slate-200">
                                        <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center font-black text-2xl border border-white/20">
                                          {attendance.length}
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-black uppercase tracking-widest text-white/50">PLATFORM ENGAGEMENT</p>
                                          <p className="text-lg font-black">LOGGED DAYS</p>
                                        </div>
                                      </div>
                                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                                        {attendance.slice(0, 10).map((a, i) => (
                                          <div key={i} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                                            <div className="flex flex-col">
                                               <span className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">{sd(a.date || a.timestamp)}</span>
                                               <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{a.day || "LOGGED"}</span>
                                            </div>
                                            <div className="text-right">
                                               <p className="text-[10px] font-black text-slate-900">{formatTime(a.time || "00:00")}</p>
                                               <Badge className="text-[7px] font-black bg-slate-900 text-white border-none px-2 py-0">PRESENT</Badge>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </Sec>

                                  {/* 6. Resume Scan */}
                                  <Sec icon={Cpu} title="Resume ATS Audit" color="text-slate-900" count={detail?.resume_ats ? 1 : 0} empty="No Scan Profile Found">
                                    {detail?.resume_ats && (() => {
                                      const ats = detail.resume_ats;
                                      const score = ats.ats_score ?? ats.score ?? 0;
                                      return (
                                        <div className="space-y-5 pt-2">
                                          <div className="flex flex-col items-center py-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-full h-1 bg-slate-100">
                                                <div className="h-full bg-slate-900 transition-all duration-1000" style={{ width: `${score}%` }} />
                                            </div>
                                            <span className="text-5xl font-black text-slate-900 leading-none">{score}</span>
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-3 underline underline-offset-8">ATS SCORE</span>
                                          </div>
                                          
                                          {ats.job_title && (
                                            <div className="p-4 bg-white rounded-2xl border border-slate-100">
                                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">TARGET ROLE</p>
                                              <p className="text-xs font-black text-slate-900 uppercase">{ats.job_title}</p>
                                            </div>
                                          )}

                                          {ats.skills && (
                                            <div className="flex flex-wrap gap-2">
                                              {ats.skills.slice(0, 10).map((sk, si) => (
                                                <Badge key={si} className="text-[9px] font-black bg-slate-900 text-white border-none py-1 px-3 rounded-full uppercase tracking-tighter">
                                                  {sk}
                                                </Badge>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </Sec>

                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}