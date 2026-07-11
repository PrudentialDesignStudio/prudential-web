import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutGrid, Images, Megaphone, Calendar, MessageSquare,
  Home, BookOpen, Phone, ShieldCheck, GraduationCap, Users,
  ClipboardList, Inbox, Settings, Star, Building2, Heart,
  ExternalLink, Music, LogOut, Eye, Sun, Moon, Upload,
  CheckCircle, AlertCircle, X, ChevronRight, Bell, FileText,
  Edit3, Trash2, Plus, Save, RefreshCw, Image as ImageIcon,
  Video, Sparkles, Clock
} from "lucide-react";
import { uploadManyToCloudinary, uploadToCloudinary, type UploadResult } from "../lib/cloudinaryUpload";
import {
  TrashTab, useCommandPalette, CommandPalette, CommandPaletteHint, type PaletteItem,
  guardNavigate, useUnsavedGuard, PreviewDrawer, EmptyState, Skeleton, SkeletonList, SkeletonCard, SkeletonGrid,
  SortableCollection, DragHandle, useBulkSelect, BulkToolbar,
} from "../components/AdminExtras";
import { motion, AnimatePresence } from "framer-motion";
import ShareTab from "./admin/ShareTab";
import "../admin-v3.css";

export const API = "/api/admin";
const CMS = "/api/cms";

export type Tab = "overview" | "gallery-images" | "gallery-videos" | "announcements" | "events" | "testimonials" | "hero" | "about" | "contact" | "values" | "divisions" | "staff" | "rules" | "admissions" | "submissions" | "settings" | "features" | "campus" | "student-life" | "portals" | "academics-content" | "anthem" | "trash" | "share";

function useToken() {
  const [token, setToken] = useState(() => localStorage.getItem("pis_admin_token") ?? sessionStorage.getItem("pis_admin_token") ?? "");
  const save  = (t: string, remember: boolean = true) => {
    if (remember) { localStorage.setItem("pis_admin_token", t); sessionStorage.removeItem("pis_admin_token"); }
    else { sessionStorage.setItem("pis_admin_token", t); localStorage.removeItem("pis_admin_token"); }
    setToken(t);
  };
  const clear = () => { localStorage.removeItem("pis_admin_token"); sessionStorage.removeItem("pis_admin_token"); setToken(""); };
  return { token, save, clear };
}
export function authH(token: string) { return { "Content-Type": "application/json", Authorization: `Bearer ${token}` }; }

// --- Toast system (fixed bottom-right, always visible regardless of scroll) ---
interface Toast { id: number; text: string; ok: boolean; }
let _toastId = 0;
const _toastListeners: Set<(t: Toast) => void> = new Set();
function pushToast(text: string, ok = true) {
  const t = { id: ++_toastId, text, ok };
  _toastListeners.forEach(fn => fn(t));
}
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const fn = (t: Toast) => {
      setToasts(prev => [...prev.slice(-4), t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4500);
    };
    _toastListeners.add(fn);
    return () => { _toastListeners.delete(fn); };
  }, []);
  return { toasts, dismiss: (id: number) => setToasts(prev => prev.filter(x => x.id !== id)) };
}
export function flash(text: string, ok = true) { pushToast(text, ok); }

function ToastContainer() {
  const { toasts, dismiss } = useToasts();
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10, pointerEvents: "none" }}>
      {toasts.map(t => (
        <div key={t.id} className={`pis-toast ${t.ok ? "pis-toast-ok" : "pis-toast-err"}`} style={{ pointerEvents: "auto" }}>
          {t.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span>{t.text}</span>
          <button onClick={() => dismiss(t.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", opacity: 0.7, marginLeft: "auto" }}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

// --- Dark mode ---
function useDarkMode() {
  const [dark, setDark] = useState(() => localStorage.getItem("pis_dark") === "1");
  useEffect(() => {
    document.documentElement.setAttribute("data-pis-theme", dark ? "dark" : "light");
    localStorage.setItem("pis_dark", dark ? "1" : "0");
  }, [dark]);
  return { dark, toggle: () => setDark(d => !d) };
}

// --- Animated count-up for stat numbers ---
function useCountUp(target: number, duration = 700) {
  const [val, setVal] = useState(0);
  const prevTarget = useRef(0);
  useEffect(() => {
    const from = prevTarget.current;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevTarget.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// --- Upload Drop Zone (no URL inputs anywhere — paste or drag-and-drop only) ---
function UploadZone({ value, onChange, accept = "image/*", label = "Drop image here or click to browse", preview = true }: {
  value: string; onChange: (url: string) => void; accept?: string; label?: string; preview?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true); setProgress(0);
    try {
      const result = await uploadToCloudinary(file, p => setProgress(p));
      onChange(result.url);
      flash("Uploaded successfully");
    } catch {
      flash("Upload failed — try again", false);
    } finally { setUploading(false); setProgress(0); }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData?.items || []).find(i => i.kind === "file")?.getAsFile();
    if (file) handleFile(file);
  };

  return (
    <div
      className={`pis-upload-zone${dragging ? " pis-upload-zone--over" : ""}${value ? " pis-upload-zone--filled" : ""}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      onClick={() => !value && inputRef.current?.click()}
      tabIndex={0}
    >
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      {uploading ? (
        <div className="pis-upload-progress">
          <RefreshCw size={20} className="pis-spin" />
          <span>Uploading… {progress}%</span>
          <div className="pis-progress-bar"><div style={{ width: `${progress}%` }} /></div>
        </div>
      ) : value && preview ? (
        <div className="pis-upload-preview">
          {accept.includes("video") ? <Video size={40} /> : <img src={value} alt="preview" />}
          <button type="button" className="pis-upload-change" onClick={e => { e.stopPropagation(); onChange(""); }}>
            <X size={14} /> Remove
          </button>
        </div>
      ) : (
        <div className="pis-upload-empty">
          <Upload size={28} />
          <p>{label}</p>
          <span className="pis-upload-or">or paste an image (Ctrl/Cmd+V)</span>
          <button type="button" className="pis-btn-ghost" onClick={() => inputRef.current?.click()}>Browse Files</button>
        </div>
      )}
    </div>
  );
}

// --- Shared form helpers ---
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="pis-field">
      <label className="pis-label">{label}{hint && <span className="pis-hint"> — {hint}</span>}</label>
      {children}
    </div>
  );
}

const ADMIN_LOGO_URL = "https://res.cloudinary.com/dagt2a1w0/image/upload/v1773768204/ChatGPT_Image_Jan_31__2026__04_03_54_AM_1769828712771_d65sw2.png";

function LoginLogo() {
  const [err, setErr] = useState(false);
  if (err) return <div className="pis-wl-mark">PIS</div>;
  return (
    <div className="pis-wl-mark pis-wl-mark--img">
      <img src={ADMIN_LOGO_URL} alt="Prudential International School" onError={() => setErr(true)} />
    </div>
  );
}

// --- Login Page ---
function LoginPage({ onLogin }: { onLogin: (t: string, remember?: boolean) => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [remember, setRemember] = useState(true);
  const [forgotStage, setForgotStage] = useState<"idle" | "confirm" | "sending" | "sent">("idle");
  const [forgotErr, setForgotErr] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
      if (!r.ok) { setErr("Incorrect password. Please try again."); return; }
      const { token } = await r.json(); onLogin(token, remember);
    } catch { setErr("Cannot connect to server. Check your connection."); }
    finally { setLoading(false); }
  };

  const sendRecoveryEmail = async () => {
    setForgotStage("sending"); setForgotErr("");
    try {
      const r = await fetch(`${API}/forgot-password`, { method: "POST" });
      if (r.status === 429) {
        const d = await r.json().catch(() => ({}));
        setForgotErr(d.error || "Please wait before trying again.");
        setForgotStage("confirm");
        return;
      }
      if (!r.ok) { setForgotErr("Couldn't send the email. Try again shortly."); setForgotStage("confirm"); return; }
      setForgotStage("sent");
      setCooldown(60);
    } catch {
      setForgotErr("Cannot connect to server."); setForgotStage("confirm");
    }
  };

  return (
    <div className="pis-wl-root">
      <div className="pis-wl-card">
        <LoginLogo />
        <h1 className="pis-wl-title">Admin Sign In</h1>
        <p className="pis-wl-sub">Prudential International School</p>

        {forgotStage === "idle" && (
          <form onSubmit={submit} className="pis-wl-form">
            <div className={`pis-wl-field${focused ? " pis-wl-field--active" : ""}`}>
              <label htmlFor="pis-pw">Password</label>
              <input
                id="pis-pw" type="password" value={pw} autoComplete="current-password"
                onChange={e => setPw(e.target.value)}
                onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                required
              />
            </div>

            {err && <div className="pis-wl-error"><AlertCircle size={15} /> {err}</div>}

            <div className="pis-wl-row">
              <label className="pis-wl-remember">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                <span>Remember me</span>
              </label>
              <button
                type="button" className="pis-wl-forgot"
                onClick={() => { setForgotStage("confirm"); setForgotErr(""); }}
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" className="pis-wl-btn" disabled={loading}>
              {loading && <RefreshCw size={16} className="pis-spin" />}
              <span>{loading ? "Signing in" : "Sign In"}</span>
            </button>
          </form>
        )}

        {(forgotStage === "confirm" || forgotStage === "sending") && (
          <div className="pis-wl-forgot-panel">
            <p className="pis-wl-forgot-copy">
              Send the current admin password to <strong>pis.abuja@gmail.com</strong>?
            </p>
            {forgotErr && <div className="pis-wl-error"><AlertCircle size={15} /> {forgotErr}</div>}
            <div className="pis-wl-forgot-actions">
              <button type="button" className="pis-wl-btn-secondary" onClick={() => setForgotStage("idle")} disabled={forgotStage === "sending"}>
                Cancel
              </button>
              <button type="button" className="pis-wl-btn" onClick={sendRecoveryEmail} disabled={forgotStage === "sending"}>
                {forgotStage === "sending" && <RefreshCw size={16} className="pis-spin" />}
                <span>{forgotStage === "sending" ? "Sending" : "Send Password"}</span>
              </button>
            </div>
          </div>
        )}

        {forgotStage === "sent" && (
          <div className="pis-wl-forgot-panel">
            <p className="pis-wl-forgot-copy">
              Password sent to <strong>pis.abuja@gmail.com</strong>. Check the inbox.
            </p>
            <button
              type="button" className="pis-wl-btn-secondary" style={{ width: "100%" }}
              onClick={() => setForgotStage("idle")}
            >
              Back to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Overview ---
function timeAgo(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr).getTime();
  if (isNaN(d)) return "";
  const diff = Math.max(0, Date.now() - d);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function StatCard({ s, onClick }: { s: { label: string; value: number; sub?: string; color: string; urgent?: boolean; icon: React.ReactNode }; onClick: () => void }) {
  const animated = useCountUp(s.value);
  return (
    <button
      className={`pis-stat-card${s.urgent ? " pis-stat-card--urgent" : ""}`}
      style={{ "--pis-stat-color": s.color } as React.CSSProperties}
      onClick={onClick}
    >
      <div className="pis-stat-icon" style={{ color: s.color, background: s.color + "18" }}>{s.icon}</div>
      <div className="pis-stat-num" style={{ color: s.color }}>{animated}</div>
      <div className="pis-stat-label">{s.label}</div>
      {s.sub && <div className="pis-stat-sub">{s.sub}</div>}
    </button>
  );
}

function OverviewTab({ token, setTab }: { token: string; setTab: (t: Tab) => void }) {
  const [counts, setCounts] = useState({ gallery: 0, staff: 0, announcements: 0, events: 0, submissions: 0, unread: 0, testimonials: 0 });
  const [activity, setActivity] = useState<{ id: string; kind: "announcement" | "event" | "message"; title: string; meta: string; when: string }[]>([]);

  useEffect(() => {
    const h = authH(token);
    Promise.all([
      fetch(`${CMS}/gallery?type=image`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/staff`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/announcements`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/events`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/submissions`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/testimonials`, { headers: h }).then(r => r.ok ? r.json() : []),
    ]).then(([gallery, staff, ann, events, subs, testimonials]) => {
      setCounts({ gallery: gallery.length, staff: staff.length, announcements: ann.length, events: events.length, submissions: subs.length, unread: subs.filter((s: any) => !s.read).length, testimonials: testimonials.length });

      const feed = [
        ...ann.map((a: any) => ({ id: `a${a.id}`, kind: "announcement" as const, title: a.title, meta: "New announcement", when: a.created_at })),
        ...events.map((e: any) => ({ id: `e${e.id}`, kind: "event" as const, title: e.title, meta: "Event added", when: e.created_at || e.eventDate })),
        ...subs.map((s: any) => ({ id: `s${s.id}`, kind: "message" as const, title: s.name, meta: s.subject || "New enquiry", when: s.created_at })),
      ]
        .filter(x => x.when)
        .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
        .slice(0, 6);
      setActivity(feed);
    }).catch(() => {});
  }, [token]);

  const stats = [
    { label: "Unread Messages", value: counts.unread, sub: `of ${counts.submissions}`, color: "#ef4444", urgent: counts.unread > 0, tab: "submissions" as Tab, icon: <MessageSquare size={20} /> },
    { label: "Gallery Photos", value: counts.gallery, color: "#3b82f6", tab: "gallery-images" as Tab, icon: <Images size={20} /> },
    { label: "Team Members", value: counts.staff, color: "#8b5cf6", tab: "staff" as Tab, icon: <Users size={20} /> },
    { label: "Announcements", value: counts.announcements, color: "#f59e0b", tab: "announcements" as Tab, icon: <Megaphone size={20} /> },
    { label: "Events", value: counts.events, color: "#10b981", tab: "events" as Tab, icon: <Calendar size={20} /> },
    { label: "Testimonials", value: counts.testimonials, color: "#ec4899", tab: "testimonials" as Tab, icon: <Star size={20} /> },
  ];

  const activityMeta: Record<string, { icon: React.ReactNode; color: string }> = {
    announcement: { icon: <Megaphone size={15} />, color: "#f59e0b" },
    event: { icon: <Calendar size={15} />, color: "#10b981" },
    message: { icon: <MessageSquare size={15} />, color: "#ef4444" },
  };

  const pages = [
    { tab: "hero" as Tab, label: "Homepage Hero", icon: <Home size={16} /> },
    { tab: "features" as Tab, label: "Why We're Different", icon: <Star size={16} /> },
    { tab: "campus" as Tab, label: "Campus Section", icon: <Building2 size={16} /> },
    { tab: "about" as Tab, label: "About Page", icon: <BookOpen size={16} /> },
    { tab: "divisions" as Tab, label: "Academic Divisions", icon: <GraduationCap size={16} /> },
    { tab: "academics-content" as Tab, label: "Academics Content", icon: <BookOpen size={16} /> },
    { tab: "values" as Tab, label: "Core Values", icon: <ShieldCheck size={16} /> },
    { tab: "student-life" as Tab, label: "Student Life", icon: <Heart size={16} /> },
    { tab: "portals" as Tab, label: "Portal Links", icon: <ExternalLink size={16} /> },
    { tab: "gallery-images" as Tab, label: "Gallery Photos", icon: <ImageIcon size={16} /> },
    { tab: "gallery-videos" as Tab, label: "Gallery Videos", icon: <Video size={16} /> },
    { tab: "anthem" as Tab, label: "Anthems", icon: <Music size={16} /> },
    { tab: "staff" as Tab, label: "Meet the Team", icon: <Users size={16} /> },
    { tab: "rules" as Tab, label: "Rules & Regs", icon: <ClipboardList size={16} /> },
    { tab: "announcements" as Tab, label: "Announcements", icon: <Megaphone size={16} /> },
    { tab: "events" as Tab, label: "Events", icon: <Calendar size={16} /> },
    { tab: "testimonials" as Tab, label: "Testimonials", icon: <MessageSquare size={16} /> },
    { tab: "contact" as Tab, label: "Contact Info", icon: <Phone size={16} /> },
    { tab: "admissions" as Tab, label: "Admissions", icon: <Inbox size={16} /> },
    { tab: "submissions" as Tab, label: "Enquiries", icon: <FileText size={16} /> },
  ];

  return (
    <div className="pis-content">
      <div className="pis-hero-header">
        <div className="pis-hero-header-text">
          <span className="pis-eyebrow"><Sparkles size={11} /> Welcome back</span>
          <h2>Dashboard Overview</h2>
          <p>Everything happening on the Prudential website at a glance.</p>
        </div>
      </div>

      {counts.unread > 0 && (
        <div className="pis-alert" onClick={() => setTab("submissions")}>
          <Bell size={16} />
          You have <strong>{counts.unread} unread {counts.unread === 1 ? "message" : "messages"}</strong> — click to view
          <ChevronRight size={15} style={{ marginLeft: "auto" }} />
        </div>
      )}

      <div className="pis-stats-grid">
        {stats.map(s => (
          <StatCard key={s.label} s={s} onClick={() => setTab(s.tab)} />
        ))}
      </div>

      <div className="pis-overview-split">
        <div>
          <h3 className="pis-section-title">All Editable Pages</h3>
          <div className="pis-pages-grid">
            {pages.map(p => (
              <button key={p.tab} className="pis-page-chip" onClick={() => setTab(p.tab)}>
                <span className="pis-page-chip-icon">{p.icon}</span>
                {p.label}
                <ChevronRight size={13} style={{ marginLeft: "auto", opacity: 0.4 }} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="pis-section-title">Recent Activity</h3>
          <div className="pis-card" style={{ padding: "4px 16px" }}>
            {activity.length === 0 ? (
              <div className="pis-activity-empty">Nothing yet — new announcements, events, and enquiries will show up here.</div>
            ) : (
              <div className="pis-activity-list">
                {activity.map((a, idx) => {
                  const m = activityMeta[a.kind];
                  return (
                    <div className="pis-activity-row" key={a.id} style={{ animationDelay: `${idx * 40}ms` }}>
                      <div className="pis-activity-icon" style={{ color: m.color, background: m.color + "18" }}>{m.icon}</div>
                      <div className="pis-activity-body">
                        <p className="pis-activity-title">{a.title} <span>· {a.meta}</span></p>
                        <span className="pis-activity-time"><Clock size={10} style={{ verticalAlign: "-1px", marginRight: 3 }} />{timeAgo(a.when)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Gallery (Images / Videos) ---
function GalleryTab({ token, mediaType }: { token: string; mediaType: "image" | "video" }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [newCatName, setNewCatName] = useState("");
  const [creatingCat, setCreatingCat] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<{ name: string; percent: number; error?: string }[]>([]);
  const bulk = useBulkSelect();
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadCategories = useCallback(async () => {
    setCatsLoading(true);
    const r = await fetch(`${API}/gallery/categories`, { headers: authH(token) });
    if (r.ok) {
      const cats = await r.json();
      setCategories(cats);
      if (cats.length && !cats.some((c: any) => c.name === activeCategory)) setActiveCategory(cats[0].name);
    }
    setCatsLoading(false);
  }, [token, activeCategory]);

  const loadItems = useCallback(async () => {
    if (!activeCategory) { setItems([]); return; }
    setItemsLoading(true);
    // Uses the authenticated admin endpoint (not the public /cms one) so that
    // unpublished/hidden items are still visible here for management —
    // the public site is the only place published=1 should be enforced.
    const r = await fetch(`${API}/gallery?category=${encodeURIComponent(activeCategory)}&type=${mediaType}`, { headers: authH(token) });
    if (r.ok) setItems(await r.json());
    setItemsLoading(false);
  }, [activeCategory, mediaType, token]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { bulk.clear(); }, [activeCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCatName.trim(); if (!name) return;
    const r = await fetch(`${API}/gallery/categories`, { method: "POST", headers: authH(token), body: JSON.stringify({ name }) });
    if (r.ok) { const cat = await r.json(); setNewCatName(""); setCreatingCat(false); flash(`Category "${name}" created`); await loadCategories(); setActiveCategory(cat.name); }
    else flash("Could not create category", false);
  };

  const renameCategory = async (id: number) => {
    const name = renameValue.trim(); if (!name) { setRenamingId(null); return; }
    const r = await fetch(`${API}/gallery/categories/${id}`, { method: "PUT", headers: authH(token), body: JSON.stringify({ name }) });
    if (r.ok) { flash("Category renamed"); setRenamingId(null); await loadCategories(); if (activeCategory) setActiveCategory(name); }
    else flash("Could not rename", false);
  };

  const deleteCategory = async (cat: any) => {
    if (cat.itemCount > 0) { flash(`Move or delete the ${cat.itemCount} item(s) first`, false); return; }
    if (!confirm(`Delete the empty category "${cat.name}"?`)) return;
    const r = await fetch(`${API}/gallery/categories/${cat.id}`, { method: "DELETE", headers: authH(token) });
    if (r.ok) { flash("Category deleted"); await loadCategories(); }
    else flash("Could not delete", false);
  };

  const handleFiles = async (files: FileList | File[]) => {
    if (!activeCategory) { flash("Select or create a category first", false); return; }
    const fileArr = Array.from(files);
    setUploads(fileArr.map(f => ({ name: f.name, percent: 0 })));
    const results = await uploadManyToCloudinary(fileArr, (i, pct) => {
      setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, percent: pct } : u));
    });
    const successes = results.filter((r): r is UploadResult => !("error" in r));
    const failures = results.filter((r): r is { error: string } => "error" in r);
    if (successes.length) {
      await fetch(`${API}/gallery/batch`, { method: "POST", headers: authH(token), body: JSON.stringify({ items: successes.map(s => ({ url: s.url, type: mediaType, category: activeCategory })) }) });
      flash(`Added ${successes.length} ${mediaType}(s) to "${activeCategory}"`);
      loadItems(); loadCategories();
    }
    if (failures.length) flash(`${failures.length} file(s) failed to upload`, false);
    setTimeout(() => setUploads([]), 2000);
  };

  const remove = async (id: number) => {
    if (!confirm("Move this item to Trash? You can restore it from Trash within 30 days.")) return;
    await fetch(`${API}/gallery/${id}`, { method: "DELETE", headers: authH(token) });
    flash("Moved to Trash"); loadItems(); loadCategories();
  };

  const bulkAction = async (action: "publish" | "unpublish" | "delete") => {
    if (action === "delete" && !confirm(`Move ${bulk.count} item(s) to Trash? You can restore them within 30 days.`)) return;
    setBulkBusy(true);
    const r = await fetch(`${API}/gallery/bulk`, { method: "POST", headers: authH(token), body: JSON.stringify({ ids: Array.from(bulk.selected), action }) });
    setBulkBusy(false);
    if (r.ok) {
      flash(action === "delete" ? `${bulk.count} item(s) moved to Trash` : action === "publish" ? `${bulk.count} item(s) published` : `${bulk.count} item(s) unpublished`);
      bulk.clear(); loadItems(); loadCategories();
    } else flash("Bulk action failed", false);
  };

  const accept = mediaType === "image" ? "image/*" : "video/*";
  const label = mediaType === "image" ? "Photos" : "Videos";

  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Gallery {label}</h2><p>{mediaType === "image" ? "Organise photos into categories, then drag and drop to upload." : "Organise videos into categories, then drag and drop to upload."}</p></div>
      </div>

      <div className="pis-card">
        <div className="pis-card-title">Categories</div>
        {catsLoading ? <Skeleton h={38} /> : (
        <div className="pis-cat-list">
          {categories.map(cat => (
            <div key={cat.id} className={`pis-cat-item${activeCategory === cat.name ? " pis-cat-item--active" : ""}`}>
              {renamingId === cat.id ? (
                <input className="pis-input" autoFocus style={{ flex: 1 }} value={renameValue}
                  aria-label={`Rename category ${cat.name}`}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => renameCategory(cat.id)}
                  onKeyDown={e => { if (e.key === "Enter") renameCategory(cat.id); if (e.key === "Escape") setRenamingId(null); }} />
              ) : (
                <button className="pis-cat-item-btn" onClick={() => setActiveCategory(cat.name)}>
                  <span className="pis-cat-item-name">{cat.name}</span>
                  <span className="pis-cat-item-count">{cat.itemCount}</span>
                </button>
              )}
              <div style={{ display: "flex", gap: 4 }}>
                <button className="pis-icon-btn" title="Rename" aria-label={`Rename category ${cat.name}`} onClick={() => { setRenamingId(cat.id); setRenameValue(cat.name); }}><Edit3 size={14} /></button>
                {cat.itemCount === 0 && <button className="pis-icon-btn pis-icon-btn--danger" title="Delete" aria-label={`Delete category ${cat.name}`} onClick={() => deleteCategory(cat)}><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
          {creatingCat ? (
            <form onSubmit={createCategory} style={{ display: "flex", gap: 8 }}>
              <input className="pis-input" autoFocus placeholder="Category name…" value={newCatName} aria-label="New category name"
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") { setCreatingCat(false); setNewCatName(""); } }} />
              <button type="submit" className="pis-btn-primary">Create</button>
              <button type="button" className="pis-btn-ghost" onClick={() => { setCreatingCat(false); setNewCatName(""); }}>Cancel</button>
            </form>
          ) : (
            <button className="pis-cat-add-btn" onClick={() => setCreatingCat(true)}>
              <Plus size={16} /> New Category
            </button>
          )}
        </div>
        )}
      </div>

      {activeCategory && (
        <div className="pis-card">
          <div className="pis-card-title">Upload to "{activeCategory}"</div>
          <div className={`pis-drop-zone pis-drop-zone--large${dragOver ? " pis-drop-zone--over" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}>
            <div className="pis-drop-empty">
              {mediaType === "image" ? <ImageIcon size={36} /> : <Video size={36} />}
              <p>Drag {label.toLowerCase()} here to upload</p>
              <label className="pis-btn-primary" style={{ cursor: "pointer" }}>
                <Upload size={15} /> Choose {label}
                <input type="file" accept={accept} multiple style={{ display: "none" }}
                  onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
            {uploads.length > 0 && (
              <div className="pis-upload-progress-list">
                {uploads.map((u, i) => (
                  <div key={i} className="pis-upload-row">
                    <div className="pis-upload-row-name">{u.name}<span>{u.error ? "Failed" : `${u.percent}%`}</span></div>
                    <div className="pis-progress-bar"><div style={{ width: `${u.percent}%`, background: u.error ? "#dc2626" : "#0B1F5C" }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeCategory && itemsLoading && (
        <div className="pis-card"><div className="pis-card-title">Loading…</div><SkeletonGrid items={6} /></div>
      )}
      {activeCategory && !itemsLoading && items.length === 0 && (
        <EmptyState
          icon={mediaType === "image" ? <ImageIcon size={24} /> : <Video size={24} />}
          title={`No ${label.toLowerCase()} in "${activeCategory}" yet`}
          body={`Drag and drop ${label.toLowerCase()} into the upload area above to add the first one.`}
        />
      )}
      {activeCategory && !itemsLoading && items.length > 0 && (
        <div className="pis-card">
          <div className="pis-card-title">{items.length} {label} in "{activeCategory}" <span style={{ fontWeight: 400, color: "var(--pis-muted)" }}>— drag to reorder</span></div>
          <BulkToolbar count={bulk.count} busy={bulkBusy}
            onPublish={() => bulkAction("publish")} onUnpublish={() => bulkAction("unpublish")}
            onDelete={() => bulkAction("delete")} onClear={bulk.clear} />
          <SortableCollection
            items={[...items].sort((a, b) => a.display_order - b.display_order)}
            setItems={setItems}
            endpoint={`${API}/gallery/reorder`}
            token={token}
            strategy="grid"
            containerClassName={`pis-media-grid${mediaType === "video" ? " pis-media-grid--video" : ""}`}
          >
            {(item, { dragHandleProps, isDragging }) => (
              <div className={`pis-media-card${item.published === 0 ? " pis-draft" : ""}${isDragging ? " pis-dragging" : ""}`}>
                {item.type === "video"
                  ? <video src={item.url} className="pis-media-thumb" muted />
                  : <img src={item.url} alt={item.caption ?? ""} className="pis-media-thumb" />}
                <div className="pis-card-corner">
                  <DragHandle {...dragHandleProps} />
                  <input type="checkbox" className="pis-select-check" aria-label={`Select ${item.caption || "item"}`}
                    checked={bulk.isSelected(item.id)} onChange={() => bulk.toggle(item.id)} />
                </div>
                {item.published === 0 && <span className="pis-draft-tag" style={{ position: "absolute", top: 8, right: 8, zIndex: 2 }}>Hidden</span>}
                <div className="pis-media-overlay">
                  <button className="pis-icon-btn pis-icon-btn--light pis-icon-btn--danger" aria-label="Delete this item" onClick={() => remove(item.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            )}
          </SortableCollection>
        </div>
      )}
    </div>
  );
}

// --- Announcements (image upload, no URL field) ---
function AnnouncementsTab({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", body: "", imageUrl: "", published: true });
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => { setLoading(true); const r = await fetch(`${API}/announcements`, { headers: authH(token) }); if (r.ok) setItems(await r.json()); setLoading(false); }, [token]);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const body = { title: form.title, body: form.body, imageUrl: form.imageUrl || null, published: form.published };
    const url = editing !== null ? `${API}/announcements/${editing}` : `${API}/announcements`;
    const r = await fetch(url, { method: editing !== null ? "PUT" : "POST", headers: authH(token), body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) { setForm({ title: "", body: "", imageUrl: "", published: true }); setEditing(null); flash(editing !== null ? "Announcement updated" : "Announcement posted"); load(); }
    else flash("Save failed", false);
  };

  const del = async (id: number) => {
    if (!confirm("Move this announcement to Trash? You can restore it within 30 days.")) return;
    await fetch(`${API}/announcements/${id}`, { method: "DELETE", headers: authH(token) });
    flash("Moved to Trash"); load();
  };

  return (
    <div className="pis-content">
      <div className="pis-page-header"><div><h2>{editing !== null ? "Edit Announcement" : "Announcements"}</h2><p>Announcements appear as notifications on the website for all visitors.</p></div></div>
      <div className="pis-card">
        <div className="pis-card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{editing !== null ? "Editing Announcement" : "New Announcement"}</span>
          <button type="button" className="pis-btn-ghost" style={{ marginBottom: -6 }} onClick={() => setPreview(true)}><Eye size={13} /> Preview</button>
        </div>
        <form onSubmit={save}>
          <Field label="Title"><input className="pis-input" placeholder="e.g. Term 2 Resumption Date" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required /></Field>
          <Field label="Message"><textarea className="pis-textarea" rows={5} placeholder="Write the announcement here…" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} required /></Field>
          <Field label="Image (optional)">
            <UploadZone value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} label="Upload an image for this announcement" />
          </Field>
          <label className="pis-check">
            <input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} />
            Visible to website visitors
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>
              {saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> {editing !== null ? "Save Changes" : "Post Announcement"}</>}
            </button>
            {editing !== null && <button type="button" className="pis-btn-ghost" onClick={() => { setEditing(null); setForm({ title: "", body: "", imageUrl: "", published: true }); }}>Cancel</button>}
          </div>
        </form>
      </div>
      {loading ? <SkeletonList rows={3} /> : (
        <div className="pis-list">
          {items.length === 0 && (
            <EmptyState icon={<Megaphone size={24} />} title="No announcements yet" body="Post your first announcement above — it'll show up as a notification on the live site." />
          )}
          {items.map(a => (
            <div key={a.id} className={`pis-list-item${!a.published ? " pis-list-item--draft" : ""}`}>
              {a.image_url && <img src={a.image_url} alt="" className="pis-list-thumb" />}
              <div className="pis-list-body">
                <strong>{a.title}</strong>
                <span>{new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} {!a.published && <span className="pis-draft-tag">Draft</span>}</span>
                <p>{a.body.slice(0, 120)}{a.body.length > 120 ? "…" : ""}</p>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="pis-btn-sm" onClick={() => { setEditing(a.id); setForm({ title: a.title, body: a.body, imageUrl: a.image_url ?? "", published: a.published }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Edit3 size={13} /> Edit</button>
                <button className="pis-btn-danger-sm" onClick={() => del(a.id)}><Trash2 size={13} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Announcement">
        <div className="pis-preview-announcement">
          {form.imageUrl && <img src={form.imageUrl} alt="" />}
          <div className="pis-preview-announcement-body">
            <span className="pis-preview-eyebrow">Announcement</span>
            <h4>{form.title || "Announcement title"}</h4>
            <p>{form.body || "Announcement message will appear here."}</p>
          </div>
        </div>
      </PreviewDrawer>
    </div>
  );
}

// --- Events (image upload, no URL field) ---
function EventsTab({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", description: "", eventDate: "", location: "", imageUrl: "", published: true });
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => { setLoading(true); const r = await fetch(`${API}/events`, { headers: authH(token) }); if (r.ok) setItems(await r.json()); setLoading(false); }, [token]);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const body = { title: form.title, description: form.description || null, eventDate: form.eventDate, location: form.location || null, imageUrl: form.imageUrl || null, published: form.published };
    const url = editing !== null ? `${API}/events/${editing}` : `${API}/events`;
    const r = await fetch(url, { method: editing !== null ? "PUT" : "POST", headers: authH(token), body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) { setForm({ title: "", description: "", eventDate: "", location: "", imageUrl: "", published: true }); setEditing(null); flash(editing !== null ? "Event updated" : "Event added"); load(); }
    else flash("Save failed", false);
  };

  const del = async (id: number) => {
    if (!confirm("Move this event to Trash? You can restore it within 30 days.")) return;
    await fetch(`${API}/events/${id}`, { method: "DELETE", headers: authH(token) });
    flash("Moved to Trash"); load();
  };

  return (
    <div className="pis-content">
      <div className="pis-page-header"><div><h2>{editing !== null ? "Edit Event" : "Events"}</h2><p>Events appear as notifications on the website. Upcoming events are highlighted.</p></div></div>
      <div className="pis-card">
        <div className="pis-card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{editing !== null ? "Editing Event" : "New Event"}</span>
          <button type="button" className="pis-btn-ghost" style={{ marginBottom: -6 }} onClick={() => setPreview(true)}><Eye size={13} /> Preview</button>
        </div>
        <form onSubmit={save}>
          <Field label="Event Title"><input className="pis-input" placeholder="e.g. Prize-Giving Day 2026" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required /></Field>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Date"><input className="pis-input" type="date" value={form.eventDate} onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))} required /></Field>
            <Field label="Location (optional)"><input className="pis-input" placeholder="e.g. School Hall" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></Field>
          </div>
          <Field label="Description (optional)"><textarea className="pis-textarea" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the event…" /></Field>
          <Field label="Event Image (optional)">
            <UploadZone value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} label="Upload a banner or flyer for this event" />
          </Field>
          <label className="pis-check"><input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} /> Published</label>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>
              {saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> {editing !== null ? "Save Changes" : "Add Event"}</>}
            </button>
            {editing !== null && <button type="button" className="pis-btn-ghost" onClick={() => { setEditing(null); setForm({ title: "", description: "", eventDate: "", location: "", imageUrl: "", published: true }); }}>Cancel</button>}
          </div>
        </form>
      </div>
      {loading ? <SkeletonList rows={3} /> : (
        <div className="pis-list">
          {items.length === 0 && (
            <EmptyState icon={<Calendar size={24} />} title="No events yet" body="Add your first event above — term dates, prize-giving day, anything on the school calendar." />
          )}
          {items.map(ev => (
            <div key={ev.id} className={`pis-list-item${!ev.published ? " pis-list-item--draft" : ""}`}>
              {ev.image_url && <img src={ev.image_url} alt="" className="pis-list-thumb" />}
              <div className="pis-list-body">
                <strong>{ev.title}</strong>
                <span>{ev.event_date}{ev.location ? ` · ${ev.location}` : ""} {!ev.published && <span className="pis-draft-tag">Draft</span>}</span>
                {ev.description && <p>{ev.description.slice(0, 100)}…</p>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button className="pis-btn-sm" onClick={() => { setEditing(ev.id); setForm({ title: ev.title, description: ev.description ?? "", eventDate: ev.event_date, location: ev.location ?? "", imageUrl: ev.image_url ?? "", published: !!ev.published }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Edit3 size={13} /> Edit</button>
                <button className="pis-btn-danger-sm" onClick={() => del(ev.id)}><Trash2 size={13} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Event">
        <div className="pis-preview-event">
          {form.imageUrl && <img src={form.imageUrl} alt="" />}
          <div className="pis-preview-event-body">
            <span className="pis-preview-eyebrow">{form.eventDate || "Date TBC"}{form.location ? ` · ${form.location}` : ""}</span>
            <h4>{form.title || "Event title"}</h4>
            <p>{form.description || "Event description will appear here."}</p>
          </div>
        </div>
      </PreviewDrawer>
    </div>
  );
}

// --- Testimonials ---
function TestimonialsTab({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ imageUrl: "", caption: "", displayOrder: 0, published: true });
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); const r = await fetch(`${API}/testimonials`, { headers: authH(token) }); if (r.ok) setItems(await r.json()); setLoading(false); }, [token]);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const body = { imageUrl: form.imageUrl, caption: form.caption || null, displayOrder: Number(form.displayOrder) || 0, published: form.published };
    const url = editing !== null ? `${API}/testimonials/${editing}` : `${API}/testimonials`;
    const r = await fetch(url, { method: editing !== null ? "PUT" : "POST", headers: authH(token), body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) { setForm({ imageUrl: "", caption: "", displayOrder: 0, published: true }); setEditing(null); flash(editing !== null ? "Testimonial updated" : "Testimonial added"); load(); }
    else flash("Save failed", false);
  };

  const del = async (id: number) => {
    if (!confirm("Move this testimonial to Trash? You can restore it within 30 days.")) return;
    await fetch(`${API}/testimonials/${id}`, { method: "DELETE", headers: authH(token) });
    flash("Moved to Trash"); load();
  };

  return (
    <div className="pis-content">
      <div className="pis-page-header"><div><h2>Testimonials</h2><p>Parent testimonial cards on the homepage. Each is a single image with the quote designed into it.</p></div></div>
      <div className="pis-card">
        <div className="pis-card-title">{editing !== null ? "Edit Testimonial" : "Add Testimonial"}</div>
        <form onSubmit={save}>
          <Field label="Testimonial Image">
            <UploadZone value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} label="Upload the testimonial image (quote should be in the image)" />
          </Field>
          <div style={{ display: "flex", gap: 16 }}>
            <Field label="Internal Label" hint="for your reference only"><input className="pis-input" placeholder="e.g. Mrs Jane Doe — Great School" value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} /></Field>
            <Field label="Order" hint="lower = first"><input className="pis-input" type="number" style={{ width: 90 }} value={form.displayOrder} onChange={e => setForm(f => ({ ...f, displayOrder: Number(e.target.value) }))} /></Field>
          </div>
          <label className="pis-check"><input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} /> Visible to website visitors</label>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving || !form.imageUrl}>
              {saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> {editing !== null ? "Save Changes" : "Add Testimonial"}</>}
            </button>
            {editing !== null && <button type="button" className="pis-btn-ghost" onClick={() => { setEditing(null); setForm({ imageUrl: "", caption: "", displayOrder: 0, published: true }); }}>Cancel</button>}
          </div>
        </form>
      </div>
      {loading ? <SkeletonGrid items={4} /> : (
        <>
          {items.length === 0 && (
            <EmptyState icon={<MessageSquare size={24} />} title="No testimonials yet" body="Upload a parent testimonial image above to feature it on the homepage." />
          )}
          {items.length > 0 && (
            <SortableCollection
              items={[...items].sort((a, b) => a.display_order - b.display_order)}
              setItems={setItems}
              endpoint={`${API}/testimonials/reorder`}
              token={token}
              strategy="grid"
              containerClassName="pis-testimonial-grid"
            >
              {(t, { dragHandleProps, isDragging }) => (
                <div className={`pis-testimonial-card${!t.published ? " pis-draft" : ""}${isDragging ? " pis-dragging" : ""}`}>
                  <div style={{ position: "relative" }}>
                    <img src={t.image_url} alt="" className="pis-testimonial-img" />
                    <div className="pis-card-corner"><DragHandle {...dragHandleProps} /></div>
                  </div>
                  <div className="pis-testimonial-meta">
                    <span>{t.caption || "Testimonial"}</span>
                    {!t.published && <span className="pis-draft-tag">Hidden</span>}
                  </div>
                  <div className="pis-testimonial-actions">
                    <button className="pis-btn-sm" onClick={() => { setEditing(t.id); setForm({ imageUrl: t.image_url, caption: t.caption ?? "", displayOrder: t.display_order ?? 0, published: !!t.published }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Edit3 size={13} /> Edit</button>
                    <button className="pis-btn-danger-sm" onClick={() => del(t.id)}><Trash2 size={13} /> Delete</button>
                  </div>
                </div>
              )}
            </SortableCollection>
          )}
        </>
      )}
    </div>
  );
}

// --- Hero ---
function HeroTab({ token }: { token: string }) {
  const blank = { headline: "", subtext: "", badge: "", btn1Text: "", btn2Text: "", bgImage: "", stat1Num: "", stat1Label: "", stat2Num: "", stat2Label: "", stat3Num: "", stat3Label: "", ctaBadge: "", ctaHeading: "", ctaBody: "", ctaBtn1: "", ctaBtn2: "" };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const savedRef = useRef(JSON.stringify(blank));
  const sf = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  useEffect(() => { fetch(`${API}/hero`, { headers: authH(token) }).then(r => r.ok ? r.json() : null).then(d => { if (d) { const next = { headline: d.headline || "", subtext: d.subtext || "", badge: d.badge || "", btn1Text: d.btn1_text || "", btn2Text: d.btn2_text || "", bgImage: d.bg_image || "", stat1Num: d.stat1_num || "", stat1Label: d.stat1_label || "", stat2Num: d.stat2_num || "", stat2Label: d.stat2_label || "", stat3Num: d.stat3_num || "", stat3Label: d.stat3_label || "", ctaBadge: d.cta_badge || "", ctaHeading: d.cta_heading || "", ctaBody: d.cta_body || "", ctaBtn1: d.cta_btn1 || "", ctaBtn2: d.cta_btn2 || "" }; setForm(next); savedRef.current = JSON.stringify(next); } }).catch(() => {}); }, [token]);
  const isDirty = JSON.stringify(form) !== savedRef.current;
  useUnsavedGuard(isDirty);
  const save = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); const r = await fetch(`${API}/hero`, { method: "PUT", headers: authH(token), body: JSON.stringify(form) }); setSaving(false); if (r.ok) { flash("Homepage saved"); savedRef.current = JSON.stringify(form); } else flash("Save failed", false); };
  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Homepage Hero & CTA</h2><p>The first thing visitors see. Keep it clear, confident, and up to date.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      <form onSubmit={save}>
        <div className="pis-card">
          <div className="pis-card-title">Hero Section</div>
          <Field label="Background Photo" hint="full-bleed image behind the headline — landscape, high-res works best">
            <UploadZone value={form.bgImage} onChange={url => setForm(f => ({ ...f, bgImage: url }))} label="Upload hero background photo" />
          </Field>
          <Field label="Ribbon Badge" hint="shown as the values row under the subtext"><input className="pis-input" value={form.badge} onChange={sf("badge")} placeholder="Discipline · Excellence · Integrity · Respect" /></Field>
          <Field label="Headline"><input className="pis-input" value={form.headline} onChange={sf("headline")} /></Field>
          <Field label="Subtext"><textarea className="pis-textarea" rows={3} value={form.subtext} onChange={sf("subtext")} /></Field>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Primary Button"><input className="pis-input" value={form.btn1Text} onChange={sf("btn1Text")} placeholder="Apply for Admission" /></Field>
            <Field label="Secondary Button"><input className="pis-input" value={form.btn2Text} onChange={sf("btn2Text")} placeholder="Discover Our Story" /></Field>
          </div>
        </div>
        <div className="pis-card">
          <div className="pis-card-title">Stats Counters</div>
          {[{ n: "stat1Num", l: "stat1Label", label: "Stat 1" }, { n: "stat2Num", l: "stat2Label", label: "Stat 2" }, { n: "stat3Num", l: "stat3Label", label: "Stat 3" }].map(s => (
            <div key={s.n} style={{ display: "flex", gap: 12, marginBottom: 8 }}>
              <Field label={`${s.label} Number`}><input className="pis-input" style={{ width: 120 }} value={(form as any)[s.n]} onChange={sf(s.n)} placeholder="11+" /></Field>
              <Field label={`${s.label} Label`}><input className="pis-input" value={(form as any)[s.l]} onChange={sf(s.l)} placeholder="Years of Excellence" /></Field>
            </div>
          ))}
        </div>
        <div className="pis-card">
          <div className="pis-card-title">Call-to-Action Section</div>
          <Field label="Badge Text"><input className="pis-input" value={form.ctaBadge} onChange={sf("ctaBadge")} /></Field>
          <Field label="Heading"><input className="pis-input" value={form.ctaHeading} onChange={sf("ctaHeading")} /></Field>
          <Field label="Body"><textarea className="pis-textarea" rows={3} value={form.ctaBody} onChange={sf("ctaBody")} /></Field>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Primary Button"><input className="pis-input" value={form.ctaBtn1} onChange={sf("ctaBtn1")} /></Field>
            <Field label="Secondary Button"><input className="pis-input" value={form.ctaBtn2} onChange={sf("ctaBtn2")} /></Field>
          </div>
        </div>
        <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>
          {saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> Save Homepage</>}
        </button>
      </form>

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Homepage Hero">
        <div className="pis-preview-hero" style={form.bgImage ? { backgroundImage: `linear-gradient(165deg, rgba(4,9,24,.72) 0%, rgba(8,18,50,.66) 40%, rgba(11,26,68,.62) 70%, rgba(5,11,28,.78) 100%), url(${form.bgImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
          {form.badge && <div className="pis-preview-hero-badge">{form.badge}</div>}
          <h1>{form.headline || "Your headline goes here"}</h1>
          <p>{form.subtext || "Your subtext goes here."}</p>
          <div className="pis-preview-hero-btns">
            {form.btn1Text && <span className="pis-preview-btn pis-preview-btn--primary">{form.btn1Text}</span>}
            {form.btn2Text && <span className="pis-preview-btn pis-preview-btn--ghost">{form.btn2Text}</span>}
          </div>
          <div className="pis-preview-hero-stats">
            {[[form.stat1Num, form.stat1Label], [form.stat2Num, form.stat2Label], [form.stat3Num, form.stat3Label]].filter(([n]) => n).map(([n, l], i) => (
              <div key={i}><strong>{n}</strong><span>{l}</span></div>
            ))}
          </div>
        </div>
        <div className="pis-preview-cta">
          {form.ctaBadge && <span className="pis-preview-cta-badge">{form.ctaBadge}</span>}
          <h3>{form.ctaHeading || "Your CTA heading"}</h3>
          <p>{form.ctaBody}</p>
          <div className="pis-preview-hero-btns">
            {form.ctaBtn1 && <span className="pis-preview-btn pis-preview-btn--primary">{form.ctaBtn1}</span>}
            {form.ctaBtn2 && <span className="pis-preview-btn pis-preview-btn--ghost-dark">{form.ctaBtn2}</span>}
          </div>
        </div>
      </PreviewDrawer>
    </div>
  );
}

// --- About ---
function AboutTab({ token }: { token: string }) {
  const blank = { story1: "", story2: "", story3: "", mission: "", vision: "", img1: "", img2: "" };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const savedRef = useRef(JSON.stringify(blank));
  useEffect(() => { fetch(`${API}/about`, { headers: authH(token) }).then(r => r.ok ? r.json() : null).then(d => { if (d) { const next = { story1: d.story1, story2: d.story2, story3: d.story3, mission: d.mission, vision: d.vision, img1: d.img1 || "", img2: d.img2 || "" }; setForm(next); savedRef.current = JSON.stringify(next); } }).catch(() => {}); }, [token]);
  const isDirty = JSON.stringify(form) !== savedRef.current;
  useUnsavedGuard(isDirty);
  const save = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); const r = await fetch(`${API}/about`, { method: "PUT", headers: authH(token), body: JSON.stringify(form) }); setSaving(false); if (r.ok) { flash("About page saved"); savedRef.current = JSON.stringify(form); } else flash("Save failed", false); };
  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>About Page</h2><p>The school story, mission, vision, and photos.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      <form onSubmit={save}>
        <div className="pis-card">
          <div className="pis-card-title">School Story</div>
          {[{ k: "story1", l: "Paragraph 1" }, { k: "story2", l: "Paragraph 2" }, { k: "story3", l: "Paragraph 3" }].map(f => (
            <Field key={f.k} label={f.l}><textarea className="pis-textarea" rows={3} value={(form as any)[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} /></Field>
          ))}
        </div>
        <div className="pis-card">
          <div className="pis-card-title">Mission & Vision</div>
          <Field label="Mission Statement"><textarea className="pis-textarea" rows={3} value={form.mission} onChange={e => setForm(f => ({ ...f, mission: e.target.value }))} /></Field>
          <Field label="Vision Statement"><textarea className="pis-textarea" rows={3} value={form.vision} onChange={e => setForm(f => ({ ...f, vision: e.target.value }))} /></Field>
        </div>
        <div className="pis-card">
          <div className="pis-card-title">Story Photos</div>
          <div style={{ display: "flex", gap: 16 }}>
            {[{ k: "img1", l: "Photo 1" }, { k: "img2", l: "Photo 2" }].map(f => (
              <div key={f.k} style={{ flex: 1 }}>
                <Field label={f.l}>
                  <UploadZone value={(form as any)[f.k]} onChange={url => setForm(p => ({ ...p, [f.k]: url }))} label={`Upload ${f.l}`} />
                </Field>
              </div>
            ))}
          </div>
        </div>
        <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>
          {saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> Save About Page</>}
        </button>
      </form>

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="About Page">
        <div className="pis-preview-about">
          {[form.story1, form.story2, form.story3].filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
          <div className="pis-preview-mv">
            {form.mission && <div><strong>Mission</strong><p>{form.mission}</p></div>}
            {form.vision && <div><strong>Vision</strong><p>{form.vision}</p></div>}
          </div>
          <div className="pis-preview-about-imgs">
            {form.img1 && <img src={form.img1} alt="" />}
            {form.img2 && <img src={form.img2} alt="" />}
          </div>
        </div>
      </PreviewDrawer>
    </div>
  );
}

// --- Contact ---
function ContactTab({ token }: { token: string }) {
  const [form, setForm] = useState({ phone1: "", phone2: "", email: "", address: "", hours: "", mapUrl: "", facebook: "" });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => { fetch(`${API}/contact`, { headers: authH(token) }).then(r => r.ok ? r.json() : null).then(d => { if (d) setForm({ phone1: d.phone1, phone2: d.phone2, email: d.email, address: d.address, hours: d.hours || "", mapUrl: d.map_url || "", facebook: d.facebook || "" }); }).catch(() => {}); }, [token]);
  const save = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); const r = await fetch(`${API}/contact`, { method: "PUT", headers: authH(token), body: JSON.stringify(form) }); setSaving(false); if (r.ok) flash("Contact info saved — changes are live everywhere"); else flash("Save failed", false); };
  const fields = [
    { k: "phone1", l: "Phone Number 1", ph: "+234 809 570 0591" },
    { k: "phone2", l: "Phone Number 2", ph: "+234 906 421 9878" },
    { k: "email", l: "Email Address", ph: "pis.abuja@gmail.com" },
    { k: "address", l: "Physical Address", ph: "16 & 18 2nd Avenue, Gwarinpa Estate…" },
    { k: "hours", l: "School Hours", ph: "Monday – Friday, 8:00am – 4:00pm" },
    { k: "facebook", l: "Facebook URL (optional)", ph: "https://facebook.com/…" },
    { k: "mapUrl", l: "Google Maps Embed URL (optional)", ph: "https://google.com/maps/embed?…" },
  ];
  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Contact Information</h2><p>These details appear in the topbar, footer, and contact page — one change updates the whole site.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      <div className="pis-card">
        <form onSubmit={save}>
          {fields.map(f => <Field key={f.k} label={f.l}><input className="pis-input" value={(form as any)[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} placeholder={f.ph} /></Field>)}
          <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> Save Contact Info</>}
          </button>
        </form>
      </div>

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Contact Information">
        <ul className="pis-preview-bullets">
          {form.phone1 && <li>{form.phone1}</li>}
          {form.phone2 && <li>{form.phone2}</li>}
          {form.email && <li>{form.email}</li>}
          {form.address && <li>{form.address}</li>}
          {form.hours && <li>{form.hours}</li>}
          {form.facebook && <li>{form.facebook}</li>}
        </ul>
      </PreviewDrawer>
    </div>
  );
}

// --- Values ---
function ValuesTab({ token }: { token: string }) {
  const [values, setValues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [newForm, setNewForm] = useState({ title: "", body: "" });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => { setLoading(true); const r = await fetch(`${API}/values`, { headers: authH(token) }); if (r.ok) setValues(await r.json()); setLoading(false); }, [token]);
  useEffect(() => { load(); }, [load]);
  const save = async (e: React.FormEvent) => { e.preventDefault(); if (!editing) return; setSaving(true); const r = await fetch(`${API}/values/${editing.id}`, { method: "PUT", headers: authH(token), body: JSON.stringify({ title: editing.title, body: editing.body }) }); setSaving(false); if (r.ok) { flash("Value updated"); setEditing(null); load(); } else flash("Save failed", false); };
  const add = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); const r = await fetch(`${API}/values`, { method: "POST", headers: authH(token), body: JSON.stringify(newForm) }); setSaving(false); if (r.ok) { flash("Value added"); setNewForm({ title: "", body: "" }); setAdding(false); load(); } };
  const del = async (id: number) => { if (!confirm("Move this value to Trash? You can restore it within 30 days.")) return; await fetch(`${API}/values/${id}`, { method: "DELETE", headers: authH(token) }); flash("Moved to Trash"); load(); };
  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Core Values</h2><p>The school's core values shown on the About page.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      {(editing || adding) && (
        <div className="pis-card">
          <form onSubmit={editing ? save : add}>
            <div className="pis-card-title">{editing ? `Editing: ${editing.title}` : "New Core Value"}</div>
            <Field label="Value Title"><input className="pis-input" value={editing ? editing.title : newForm.title} onChange={e => editing ? setEditing((v: any) => ({ ...v, title: e.target.value })) : setNewForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Integrity" required /></Field>
            <Field label="Description"><textarea className="pis-textarea" rows={3} value={editing ? editing.body : newForm.body} onChange={e => editing ? setEditing((v: any) => ({ ...v, body: e.target.value })) : setNewForm(f => ({ ...f, body: e.target.value }))} required /></Field>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>{saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> Save</>}</button>
              <button type="button" className="pis-btn-ghost" onClick={() => { setEditing(null); setAdding(false); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {!editing && !adding && <button className="pis-btn-primary" style={{ marginBottom: 16 }} onClick={() => setAdding(true)}><Plus size={15} /> Add Value</button>}
      {loading ? <SkeletonList rows={4} /> : (
        <>
          {values.length === 0 && (
            <EmptyState icon={<ShieldCheck size={24} />} title="No core values yet" body="Add the school's core values above — they'll show up on the About page." />
          )}
          {values.length > 0 && (
            <SortableCollection
              items={[...values].sort((a, b) => a.display_order - b.display_order)}
              setItems={setValues}
              endpoint={`${API}/values/reorder`}
              token={token}
              strategy="list"
              containerClassName="pis-list"
            >
              {(v, { dragHandleProps, isDragging }) => (
                <div className={`pis-list-item${isDragging ? " pis-dragging" : ""}`}>
                  <DragHandle {...dragHandleProps} />
                  <div className="pis-list-body"><strong>{v.title}</strong><p>{v.body.slice(0, 100)}…</p></div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="pis-btn-sm" onClick={() => { setEditing({ ...v }); setAdding(false); }}><Edit3 size={13} /> Edit</button>
                    <button className="pis-btn-danger-sm" onClick={() => del(v.id)}><Trash2 size={13} /> Delete</button>
                  </div>
                </div>
              )}
            </SortableCollection>
          )}
        </>
      )}

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Core Values">
        {values.length === 0 ? <div className="pis-preview-empty">No values added yet.</div> : (
          <ul className="pis-preview-bullets" style={{ gap: 16 }}>
            {[...values].sort((a, b) => a.display_order - b.display_order).map((v: any) => (
              <li key={v.id} style={{ alignItems: "flex-start", display: "block" }}>
                <strong style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: "var(--pis-text)", marginBottom: 4 }}>{v.title}</strong>
                <span style={{ fontSize: 13, color: "var(--pis-muted)", lineHeight: 1.6 }}>{v.body}</span>
              </li>
            ))}
          </ul>
        )}
      </PreviewDrawer>
    </div>
  );
}

// --- Divisions ---
function DivisionsTab({ token }: { token: string }) {
  const [divisions, setDivisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [newForm, setNewForm] = useState({ title: "", age_range: "", body: "" });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => { setLoading(true); const r = await fetch(`${API}/divisions`, { headers: authH(token) }); if (r.ok) setDivisions(await r.json()); setLoading(false); }, [token]);
  useEffect(() => { load(); }, [load]);
  const save = async (e: React.FormEvent) => { e.preventDefault(); if (!editing) return; setSaving(true); const r = await fetch(`${API}/divisions/${editing.id}`, { method: "PUT", headers: authH(token), body: JSON.stringify({ title: editing.title, ageRange: editing.age_range, body: editing.body }) }); setSaving(false); if (r.ok) { flash("Division updated"); setEditing(null); load(); } };
  const add = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); const r = await fetch(`${API}/divisions`, { method: "POST", headers: authH(token), body: JSON.stringify(newForm) }); setSaving(false); if (r.ok) { flash("Division added"); setNewForm({ title: "", age_range: "", body: "" }); setAdding(false); load(); } };
  const del = async (id: number) => { if (!confirm("Move this division to Trash? You can restore it within 30 days.")) return; await fetch(`${API}/divisions/${id}`, { method: "DELETE", headers: authH(token) }); flash("Moved to Trash"); load(); };
  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Academic Divisions</h2><p>Pre-School, Elementary, and Secondary sections.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      {(editing || adding) && (
        <div className="pis-card">
          <form onSubmit={editing ? save : add}>
            <div className="pis-card-title">{editing ? `Editing: ${editing.title}` : "New Division"}</div>
            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Division Name"><input className="pis-input" value={editing ? editing.title : newForm.title} onChange={e => editing ? setEditing((v: any) => ({ ...v, title: e.target.value })) : setNewForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Pre-School" required /></Field>
              <Field label="Age Range"><input className="pis-input" value={editing ? editing.age_range : newForm.age_range} onChange={e => editing ? setEditing((v: any) => ({ ...v, age_range: e.target.value })) : setNewForm(f => ({ ...f, age_range: e.target.value }))} placeholder="Ages 2 – 5" /></Field>
            </div>
            <Field label="Description"><textarea className="pis-textarea" rows={4} value={editing ? editing.body : newForm.body} onChange={e => editing ? setEditing((v: any) => ({ ...v, body: e.target.value })) : setNewForm(f => ({ ...f, body: e.target.value }))} required /></Field>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>{saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> Save</>}</button>
              <button type="button" className="pis-btn-ghost" onClick={() => { setEditing(null); setAdding(false); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {!editing && !adding && <button className="pis-btn-primary" style={{ marginBottom: 16 }} onClick={() => setAdding(true)}><Plus size={15} /> Add Division</button>}
      {loading ? <SkeletonList rows={3} /> : (
        <>
          {divisions.length === 0 && (
            <EmptyState icon={<GraduationCap size={24} />} title="No academic divisions yet" body="Add Pre-School, Elementary, Secondary, or however this school structures its divisions." />
          )}
          {divisions.length > 0 && (
            <SortableCollection
              items={[...divisions].sort((a, b) => a.display_order - b.display_order)}
              setItems={setDivisions}
              endpoint={`${API}/divisions/reorder`}
              token={token}
              strategy="list"
              containerClassName="pis-list"
            >
              {(d, { dragHandleProps, isDragging }) => (
                <div className={`pis-list-item${isDragging ? " pis-dragging" : ""}`}>
                  <DragHandle {...dragHandleProps} />
                  <div className="pis-list-body"><strong>{d.title}</strong> <span style={{ color: "var(--pis-muted)", fontSize: 13 }}>({d.age_range})</span><p>{d.body?.slice(0, 100)}…</p></div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="pis-btn-sm" onClick={() => { setEditing({ ...d }); setAdding(false); }}><Edit3 size={13} /> Edit</button>
                    <button className="pis-btn-danger-sm" onClick={() => del(d.id)}><Trash2 size={13} /> Delete</button>
                  </div>
                </div>
              )}
            </SortableCollection>
          )}
        </>
      )}

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Academic Divisions">
        {divisions.length === 0 ? <div className="pis-preview-empty">No divisions added yet.</div> : (
          <div className="pis-preview-cardlist">
            {[...divisions].sort((a, b) => a.display_order - b.display_order).map((d: any) => (
              <div key={d.id} className="pis-preview-cardlist-item">
                <div className="pis-preview-cardlist-body">
                  <strong>{d.title} {d.age_range && <span style={{ fontWeight: 400, color: "var(--pis-muted)" }}>({d.age_range})</span>}</strong>
                  <p>{d.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </PreviewDrawer>
    </div>
  );
}

// --- Features ---
function FeaturesTab({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", body: "" });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => { const r = await fetch(`${API}/features`, { headers: authH(token) }); if (r.ok) setItems(await r.json()); }, [token]);
  useEffect(() => { load(); }, [load]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const max = items.reduce((m: number, i: any) => Math.max(m, i.display_order), 0);
    const url = editing !== null ? `${API}/features/${editing}` : `${API}/features`;
    const r = await fetch(url, { method: editing !== null ? "PUT" : "POST", headers: authH(token), body: JSON.stringify({ ...form, displayOrder: editing !== null ? undefined : max + 1 }) });
    setSaving(false);
    if (r.ok) { setForm({ title: "", body: "" }); setEditing(null); flash(editing !== null ? "Feature updated" : "Feature added"); load(); }
    else flash("Save failed", false);
  };
  const del = async (id: number) => { if (!confirm("Delete?")) return; await fetch(`${API}/features/${id}`, { method: "DELETE", headers: authH(token) }); flash("Deleted"); load(); };
  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Why We're Different</h2><p>The feature cards on the homepage. Icons are assigned automatically.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      <div className="pis-card">
        <form onSubmit={save}>
          <div className="pis-card-title">{editing !== null ? "Edit Feature" : "Add Feature"}</div>
          <Field label="Feature Title"><input className="pis-input" placeholder="e.g. Two Curricula, One School" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required /></Field>
          <Field label="Description"><textarea className="pis-textarea" rows={3} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} required /></Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>{saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> {editing !== null ? "Update" : "Add Feature"}</>}</button>
            {editing !== null && <button type="button" className="pis-btn-ghost" onClick={() => { setEditing(null); setForm({ title: "", body: "" }); }}>Cancel</button>}
          </div>
        </form>
      </div>
      <div className="pis-list">
        {items.map(item => (
          <div key={item.id} className="pis-list-item">
            <div className="pis-list-body"><strong>{item.title}</strong><p>{item.body.slice(0, 100)}…</p></div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="pis-btn-sm" onClick={() => { setEditing(item.id); setForm({ title: item.title, body: item.body }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Edit3 size={13} /> Edit</button>
              <button className="pis-btn-danger-sm" onClick={() => del(item.id)}><Trash2 size={13} /> Delete</button>
            </div>
          </div>
        ))}
      </div>

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Why We're Different">
        {items.length === 0 ? <div className="pis-preview-empty">No feature cards added yet.</div> : (
          <div className="pis-preview-cardlist">
            {[...items].sort((a, b) => a.display_order - b.display_order).map((item: any) => (
              <div key={item.id} className="pis-preview-cardlist-item">
                <div className="pis-preview-cardlist-body">
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </PreviewDrawer>
    </div>
  );
}

// --- Campus ---
function CampusTab({ token }: { token: string }) {
  const [form, setForm] = useState({ heading: "", subtext: "", bullet1: "", bullet2: "", bullet3: "", bullet4: "" });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const sf = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  useEffect(() => { fetch(`${API}/campus`, { headers: authH(token) }).then(r => r.ok ? r.json() : null).then(d => { if (d) setForm({ heading: d.heading, subtext: d.subtext, bullet1: d.bullet1, bullet2: d.bullet2, bullet3: d.bullet3, bullet4: d.bullet4 }); }).catch(() => {}); }, [token]);
  const save = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); const r = await fetch(`${API}/campus`, { method: "PUT", headers: authH(token), body: JSON.stringify(form) }); setSaving(false); if (r.ok) flash("Campus section saved"); else flash("Save failed", false); };
  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Campus Section</h2><p>The "Come See the Campus" section on the homepage.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      <div className="pis-card">
        <form onSubmit={save}>
          <Field label="Section Heading"><input className="pis-input" value={form.heading} onChange={sf("heading")} /></Field>
          <Field label="Description"><textarea className="pis-textarea" rows={3} value={form.subtext} onChange={sf("subtext")} /></Field>
          {(["bullet1", "bullet2", "bullet3", "bullet4"] as const).map((k, i) => (
            <Field key={k} label={`Bullet Point ${i + 1}`}><input className="pis-input" value={form[k]} onChange={sf(k)} placeholder={["Science Labs", "Sports Complex", "Modern Classrooms", "Art Studios"][i]} /></Field>
          ))}
          <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> Save Campus Section</>}
          </button>
        </form>
      </div>

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Campus Section">
        <div className="pis-preview-section-head">
          <h3>{form.heading || "Section heading"}</h3>
          <p>{form.subtext}</p>
        </div>
        <ul className="pis-preview-bullets">
          {[form.bullet1, form.bullet2, form.bullet3, form.bullet4].filter(Boolean).map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      </PreviewDrawer>
    </div>
  );
}

// --- Student Life ---
function StudentLifeTab({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", body: "", imageUrl: "" });
  const [clubName, setClubName] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => { const r = await fetch(`${API}/student-life`, { headers: authH(token) }); if (r.ok) { const d = await r.json(); setItems(d.items || []); setClubs(d.clubs || []); } }, [token]);
  useEffect(() => { load(); }, [load]);
  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const max = items.reduce((m: number, i: any) => Math.max(m, i.display_order), 0);
    const url = editing !== null ? `${API}/student-life/items/${editing}` : `${API}/student-life/items`;
    const r = await fetch(url, { method: editing !== null ? "PUT" : "POST", headers: authH(token), body: JSON.stringify({ ...form, displayOrder: editing !== null ? undefined : max + 1 }) });
    setSaving(false);
    if (r.ok) { setForm({ title: "", body: "", imageUrl: "" }); setEditing(null); flash("Saved"); load(); }
  };
  const delItem = async (id: number) => { if (!confirm("Delete?")) return; await fetch(`${API}/student-life/items/${id}`, { method: "DELETE", headers: authH(token) }); flash("Deleted"); load(); };
  const addClub = async (e: React.FormEvent) => { e.preventDefault(); const r = await fetch(`${API}/student-life/clubs`, { method: "POST", headers: authH(token), body: JSON.stringify({ name: clubName }) }); if (r.ok) { setClubName(""); flash("Club added"); load(); } };
  const delClub = async (id: number) => { await fetch(`${API}/student-life/clubs/${id}`, { method: "DELETE", headers: authH(token) }); load(); };
  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Student Life</h2><p>Activity sections and clubs shown on the Student Life page.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      <div className="pis-card">
        <div className="pis-card-title">{editing !== null ? "Edit Activity" : "Add Activity"}</div>
        <form onSubmit={saveItem}>
          <Field label="Activity Title"><input className="pis-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Sports & Athletics" required /></Field>
          <Field label="Description"><textarea className="pis-textarea" rows={4} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} required /></Field>
          <Field label="Image (optional)">
            <UploadZone value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} label="Upload an image for this activity" />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>{saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> {editing !== null ? "Update Activity" : "Add Activity"}</>}</button>
            {editing !== null && <button type="button" className="pis-btn-ghost" onClick={() => { setEditing(null); setForm({ title: "", body: "", imageUrl: "" }); }}>Cancel</button>}
          </div>
        </form>
      </div>
      <div className="pis-list">
        {items.map(item => (
          <div key={item.id} className="pis-list-item">
            {item.image_url && <img src={item.image_url} alt="" className="pis-list-thumb" />}
            <div className="pis-list-body"><strong>{item.title}</strong><p>{item.body.slice(0, 90)}…</p></div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="pis-btn-sm" onClick={() => { setEditing(item.id); setForm({ title: item.title, body: item.body, imageUrl: item.image_url || "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Edit3 size={13} /> Edit</button>
              <button className="pis-btn-danger-sm" onClick={() => delItem(item.id)}><Trash2 size={13} /> Delete</button>
            </div>
          </div>
        ))}
      </div>
      <div className="pis-card" style={{ marginTop: 24 }}>
        <div className="pis-card-title">Clubs & Societies</div>
        <form onSubmit={addClub} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input className="pis-input" style={{ flex: 1 }} placeholder="Club name, e.g. JET Science Club" value={clubName} onChange={e => setClubName(e.target.value)} required />
          <button type="submit" className="pis-btn-primary"><Plus size={15} /> Add</button>
        </form>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {clubs.map((c: any) => (
            <span key={c.id} className="pis-chip">
              {c.name}
              <button onClick={() => delClub(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", marginLeft: 4, display: "flex", alignItems: "center" }}><X size={13} /></button>
            </span>
          ))}
        </div>
      </div>

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Student Life">
        {items.length === 0 ? <div className="pis-preview-empty">No activities added yet.</div> : (
          <div className="pis-preview-cardlist">
            {[...items].sort((a, b) => a.display_order - b.display_order).map((item: any) => (
              <div key={item.id} className="pis-preview-cardlist-item">
                {item.image_url ? <img src={item.image_url} alt="" /> : <div className="pis-preview-avatar">{item.title?.[0]}</div>}
                <div className="pis-preview-cardlist-body">
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {clubs.length > 0 && (
          <>
            <div className="pis-preview-section-head" style={{ marginTop: 22 }}><h3 style={{ fontSize: 15 }}>Clubs & Societies</h3></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {clubs.map((c: any) => <span key={c.id} className="pis-chip">{c.name}</span>)}
            </div>
          </>
        )}
      </PreviewDrawer>
    </div>
  );
}

// --- Portals ---
function PortalsTab({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", description: "", tag: "", url: "", color: "#003366" });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => { const r = await fetch(`${API}/portals`, { headers: authH(token) }); if (r.ok) setItems(await r.json()); }, [token]);
  useEffect(() => { load(); }, [load]);
  const save = async (e: React.FormEvent) => { e.preventDefault(); if (editing === null) return; setSaving(true); const r = await fetch(`${API}/portals/${editing}`, { method: "PUT", headers: authH(token), body: JSON.stringify(form) }); setSaving(false); if (r.ok) { setEditing(null); flash("Portal updated"); load(); } else flash("Save failed", false); };
  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Portal Links</h2><p>Student, Parent, and Staff portal cards. Click Edit to update any portal's URL or description.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      {editing !== null && (
        <div className="pis-card">
          <form onSubmit={save}>
            <div className="pis-card-title">Editing Portal</div>
            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Title"><input className="pis-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required /></Field>
              <Field label="Tag"><input className="pis-input" style={{ width: 120 }} value={form.tag} onChange={e => setForm(f => ({ ...f, tag: e.target.value }))} placeholder="Students" /></Field>
              <Field label="Card Color"><input type="color" className="pis-input" style={{ width: 60, height: 42, padding: 2 }} value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} /></Field>
            </div>
            <Field label="Description"><textarea className="pis-textarea" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></Field>
            <Field label="Login URL"><input className="pis-input" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://…" /></Field>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>{saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> Save Portal</>}</button>
              <button type="button" className="pis-btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      <div className="pis-list">
        {items.map(item => (
          <div key={item.id} className="pis-list-item">
            <div className="pis-list-icon" style={{ background: item.color + "18", color: item.color }}>{item.tag?.[0]}</div>
            <div className="pis-list-body"><strong>{item.title}</strong> <span className="pis-badge-sm">{item.tag}</span><span>{item.description}</span><span style={{ color: "var(--pis-muted)", fontSize: 12 }}>{item.url}</span></div>
            <button className="pis-btn-sm" onClick={() => { setEditing(item.id); setForm({ title: item.title, description: item.description, tag: item.tag, url: item.url, color: item.color }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Edit3 size={13} /> Edit</button>
          </div>
        ))}
      </div>

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Portal Links">
        {items.length === 0 ? <div className="pis-preview-empty">No portals added yet.</div> : items.map((item: any) => (
          <div key={item.id} className="pis-preview-portal-card" style={{ background: item.color || "#003366" }}>
            <strong>{item.title} {item.tag && <span style={{ fontWeight: 400, opacity: .8 }}>· {item.tag}</span>}</strong>
            <span>{item.description}</span>
          </div>
        ))}
      </PreviewDrawer>
    </div>
  );
}

// --- Academics Content ---
function AcademicsContentTab({ token }: { token: string }) {
  const [form, setForm] = useState({ curriculumHeading: "", curriculumBody: "", curriculumImage: "", scienceHeading: "", scienceBody: "", scienceImage: "" });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const sf = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  useEffect(() => { fetch(`${API}/academics-content`, { headers: authH(token) }).then(r => r.ok ? r.json() : null).then(d => { if (d) setForm({ curriculumHeading: d.curriculum_heading, curriculumBody: d.curriculum_body, curriculumImage: d.curriculum_image || "", scienceHeading: d.science_heading, scienceBody: d.science_body, scienceImage: d.science_image || "" }); }).catch(() => {}); }, [token]);
  const save = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); const r = await fetch(`${API}/academics-content`, { method: "PUT", headers: authH(token), body: JSON.stringify(form) }); setSaving(false); if (r.ok) flash("Academics content saved"); else flash("Save failed", false); };
  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Academics Content</h2><p>Curriculum overview and science section on the Academics page.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      <form onSubmit={save}>
        <div className="pis-card">
          <div className="pis-card-title">Curriculum Section</div>
          <Field label="Heading"><input className="pis-input" value={form.curriculumHeading} onChange={sf("curriculumHeading")} /></Field>
          <Field label="Body Text"><textarea className="pis-textarea" rows={4} value={form.curriculumBody} onChange={sf("curriculumBody")} /></Field>
          <Field label="Image">
            <UploadZone value={form.curriculumImage} onChange={url => setForm(f => ({ ...f, curriculumImage: url }))} label="Upload curriculum section image" />
          </Field>
        </div>
        <div className="pis-card">
          <div className="pis-card-title">Science Section</div>
          <Field label="Heading"><input className="pis-input" value={form.scienceHeading} onChange={sf("scienceHeading")} /></Field>
          <Field label="Body Text"><textarea className="pis-textarea" rows={4} value={form.scienceBody} onChange={sf("scienceBody")} /></Field>
          <Field label="Image">
            <UploadZone value={form.scienceImage} onChange={url => setForm(f => ({ ...f, scienceImage: url }))} label="Upload science section image" />
          </Field>
        </div>
        <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>
          {saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> Save Academics Content</>}
        </button>
      </form>

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Academics Content">
        {form.curriculumImage && <img src={form.curriculumImage} alt="" className="pis-preview-image-banner" />}
        <div className="pis-preview-section-head">
          <h3>{form.curriculumHeading || "Curriculum heading"}</h3>
          <p>{form.curriculumBody}</p>
        </div>
        {form.scienceImage && <img src={form.scienceImage} alt="" className="pis-preview-image-banner" style={{ marginTop: 18 }} />}
        <div className="pis-preview-section-head" style={{ marginTop: 18 }}>
          <h3>{form.scienceHeading || "Science section heading"}</h3>
          <p>{form.scienceBody}</p>
        </div>
      </PreviewDrawer>
    </div>
  );
}

// --- Anthem ---
function AnthemTab({ token }: { token: string }) {
  const [form, setForm] = useState({ schoolTitle: "", schoolLyrics: "", schoolAudio: "", nationalTitle: "", nationalLyrics: "", nationalAudio: "" });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const sf = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  useEffect(() => { fetch(`${API}/anthem`, { headers: authH(token) }).then(r => r.ok ? r.json() : null).then(d => { if (d) setForm({ schoolTitle: d.school_title || "", schoolLyrics: d.school_lyrics || "", schoolAudio: d.school_audio || "", nationalTitle: d.national_title || "", nationalLyrics: d.national_lyrics || "", nationalAudio: d.national_audio || "" }); }).catch(() => {}); }, [token]);
  const save = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); const r = await fetch(`${API}/anthem`, { method: "PUT", headers: authH(token), body: JSON.stringify(form) }); setSaving(false); if (r.ok) flash("Anthems saved"); else flash("Save failed", false); };

  const AudioField = ({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) => (
    <Field label={label}>
      {value ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <audio controls src={value} style={{ width: "100%", height: 40 }} />
          <button type="button" className="pis-btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => onChange("")}><X size={14} /> Remove Audio</button>
        </div>
      ) : (
        <UploadZone value="" onChange={onChange} accept="audio/*" label="Drag MP3 here or click to browse" preview={false} />
      )}
    </Field>
  );

  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Anthems</h2><p>School anthem and national anthem — titles, lyrics, and audio files.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      <form onSubmit={save}>
        <div className="pis-card">
          <div className="pis-card-title">School Anthem</div>
          <Field label="Title"><input className="pis-input" value={form.schoolTitle} onChange={sf("schoolTitle")} /></Field>
          <Field label="Lyrics"><textarea className="pis-textarea" rows={10} value={form.schoolLyrics} onChange={sf("schoolLyrics")} placeholder="Enter lyrics…" /></Field>
          <AudioField label="Audio File (MP3)" value={form.schoolAudio} onChange={url => setForm(f => ({ ...f, schoolAudio: url }))} />
        </div>
        <div className="pis-card">
          <div className="pis-card-title">National Anthem</div>
          <Field label="Title"><input className="pis-input" value={form.nationalTitle} onChange={sf("nationalTitle")} /></Field>
          <Field label="Lyrics"><textarea className="pis-textarea" rows={10} value={form.nationalLyrics} onChange={sf("nationalLyrics")} /></Field>
          <AudioField label="Audio File (MP3)" value={form.nationalAudio} onChange={url => setForm(f => ({ ...f, nationalAudio: url }))} />
        </div>
        <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>
          {saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> Save Anthems</>}
        </button>
      </form>

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Anthems">
        <div className="pis-preview-section-head">
          <h3>{form.schoolTitle || "School Anthem"}</h3>
        </div>
        <p style={{ whiteSpace: "pre-line", fontSize: 13.5, lineHeight: 1.8, color: "var(--pis-text)" }}>{form.schoolLyrics || "No lyrics added yet."}</p>
        {form.schoolAudio && <audio controls src={form.schoolAudio} style={{ width: "100%", marginTop: 10 }} />}

        <div className="pis-preview-section-head" style={{ marginTop: 26 }}>
          <h3>{form.nationalTitle || "National Anthem"}</h3>
        </div>
        <p style={{ whiteSpace: "pre-line", fontSize: 13.5, lineHeight: 1.8, color: "var(--pis-text)" }}>{form.nationalLyrics || "No lyrics added yet."}</p>
        {form.nationalAudio && <audio controls src={form.nationalAudio} style={{ width: "100%", marginTop: 10 }} />}
      </PreviewDrawer>
    </div>
  );
}

// --- Staff ---
function StaffTab({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", title: "", department: "", imageUrl: "" });
  const [saving, setSaving] = useState(false);
  const bulk = useBulkSelect();
  const [bulkBusy, setBulkBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); const r = await fetch(`${API}/staff`, { headers: authH(token) }); if (r.ok) setItems(await r.json()); setLoading(false); }, [token]);
  useEffect(() => { load(); }, [load]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const max = items.reduce((m: number, i: any) => Math.max(m, i.display_order), 0);
    const url = editing !== null ? `${API}/staff/${editing}` : `${API}/staff`;
    const r = await fetch(url, { method: editing !== null ? "PUT" : "POST", headers: authH(token), body: JSON.stringify({ ...form, displayOrder: editing !== null ? undefined : max + 1 }) });
    setSaving(false);
    if (r.ok) { setForm({ name: "", title: "", department: "", imageUrl: "" }); setEditing(null); flash(editing !== null ? "Updated" : "Team member added"); load(); }
    else flash("Save failed", false);
  };
  const del = async (id: number) => { if (!confirm("Move this team member to Trash? You can restore them within 30 days.")) return; await fetch(`${API}/staff/${id}`, { method: "DELETE", headers: authH(token) }); flash("Moved to Trash"); load(); };
  const [preview, setPreview] = useState(false);
  const bulkAction = async (action: "publish" | "unpublish" | "delete") => {
    if (action === "delete" && !confirm(`Move ${bulk.count} team member(s) to Trash? You can restore them within 30 days.`)) return;
    setBulkBusy(true);
    const r = await fetch(`${API}/staff/bulk`, { method: "POST", headers: authH(token), body: JSON.stringify({ ids: Array.from(bulk.selected), action }) });
    setBulkBusy(false);
    if (r.ok) {
      flash(action === "delete" ? `${bulk.count} team member(s) moved to Trash` : action === "publish" ? `${bulk.count} team member(s) published` : `${bulk.count} team member(s) unpublished`);
      bulk.clear(); load();
    } else flash("Bulk action failed", false);
  };
  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Meet the Team</h2><p>Staff profiles shown on the Team page. Square photos work best.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      <div className="pis-card">
        <form onSubmit={save}>
          <div className="pis-card-title">{editing !== null ? "Edit Team Member" : "Add Team Member"}</div>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Full Name"><input className="pis-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Dr. Essien N. Patrick" required /></Field>
            <Field label="Job Title"><input className="pis-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Principal" required /></Field>
          </div>
          <Field label="Department (optional)"><input className="pis-input" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} /></Field>
          <Field label="Photo">
            <UploadZone value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} label="Upload staff photo (square photos work best)" />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>{saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> {editing !== null ? "Update" : "Add Member"}</>}</button>
            {editing !== null && <button type="button" className="pis-btn-ghost" onClick={() => { setEditing(null); setForm({ name: "", title: "", department: "", imageUrl: "" }); }}>Cancel</button>}
          </div>
        </form>
      </div>
      {loading ? <SkeletonGrid items={6} /> : (
        <>
          {items.length === 0 && (
            <EmptyState icon={<Users size={24} />} title="No team members yet" body="Add your first staff profile above — it'll appear on the public Team page." />
          )}
          {items.length > 0 && (
            <>
              <div className="pis-card-title" style={{ marginBottom: 8 }}>{items.length} team member(s) <span style={{ fontWeight: 400, color: "var(--pis-muted)" }}>— drag to reorder</span></div>
              <BulkToolbar count={bulk.count} busy={bulkBusy}
                onPublish={() => bulkAction("publish")} onUnpublish={() => bulkAction("unpublish")}
                onDelete={() => bulkAction("delete")} onClear={bulk.clear} />
              <SortableCollection
                items={[...items].sort((a, b) => a.display_order - b.display_order)}
                setItems={setItems}
                endpoint={`${API}/staff/reorder`}
                token={token}
                strategy="grid"
                containerClassName="pis-staff-grid"
              >
                {(item, { dragHandleProps, isDragging }) => (
                  <div className={`pis-staff-card${item.published === 0 ? " pis-draft" : ""}${isDragging ? " pis-dragging" : ""}`}>
                    <DragHandle {...dragHandleProps} />
                    <input type="checkbox" className="pis-select-check" aria-label={`Select ${item.name}`}
                      checked={bulk.isSelected(item.id)} onChange={() => bulk.toggle(item.id)} />
                    <div className="pis-staff-avatar">
                      {item.image_url ? <img src={item.image_url} alt={item.name} /> : <span>{item.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}</span>}
                    </div>
                    <div className="pis-staff-info">
                      <strong>{item.name}</strong><span>{item.title}</span>
                      {item.department && <span style={{ color: "var(--pis-muted)", fontSize: 12 }}>{item.department}</span>}
                      {item.published === 0 && <span className="pis-draft-tag">Hidden</span>}
                    </div>
                    <div className="pis-staff-actions">
                      <button className="pis-btn-sm" aria-label={`Edit ${item.name}`} onClick={() => { setEditing(item.id); setForm({ name: item.name, title: item.title, department: item.department || "", imageUrl: item.image_url || "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Edit3 size={13} /></button>
                      <button className="pis-btn-danger-sm" aria-label={`Delete ${item.name}`} onClick={() => del(item.id)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                )}
              </SortableCollection>
            </>
          )}
        </>
      )}

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Meet the Team">
        {items.filter((i: any) => i.published !== 0).length === 0 ? <div className="pis-preview-empty">No published team members yet.</div> : (
          <div className="pis-preview-cardlist">
            {[...items].filter((i: any) => i.published !== 0).sort((a, b) => a.display_order - b.display_order).map((item: any) => (
              <div key={item.id} className="pis-preview-cardlist-item">
                {item.image_url ? <img src={item.image_url} alt={item.name} /> : <div className="pis-preview-avatar">{item.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}</div>}
                <div className="pis-preview-cardlist-body">
                  <strong>{item.name}</strong>
                  <span>{item.title}{item.department ? ` · ${item.department}` : ""}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </PreviewDrawer>
    </div>
  );
}

// --- Rules ---
function RulesTab({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [form, setForm] = useState({ content: "" });
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => { setLoading(true); const r = await fetch(`${API}/rules`, { headers: authH(token) }); if (r.ok) setItems(await r.json()); setLoading(false); }, [token]);
  useEffect(() => { load(); }, [load]);
  const parseContent = (c: string): string[] => { try { const p = JSON.parse(c); if (Array.isArray(p)) return p; } catch {} return [c]; };
  const grouped = items.reduce((acc, r) => { if (!acc[r.category]) acc[r.category] = []; acc[r.category].push(r); return acc; }, {} as Record<string, any[]>);
  const categories = Object.keys(grouped);
  const createCat = async (e: React.FormEvent) => { e.preventDefault(); const name = newCatName.trim(); if (!name) return; setSelectedCat(name); setNewCatName(""); setAddingCat(false); flash(`Category "${name}" ready — add rules below`); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selectedCat) return; setSaving(true);
    const maxOrder = items.reduce((m: number, i: any) => Math.max(m, i.display_order), -1);
    const contentArray = form.content.split("\n").map((s: string) => s.trim()).filter(Boolean);
    const body = { category: selectedCat, content: JSON.stringify(contentArray), displayOrder: editing !== null ? undefined : maxOrder + 1 };
    const url = editing !== null ? `${API}/rules/${editing}` : `${API}/rules`;
    const r = await fetch(url, { method: editing !== null ? "PUT" : "POST", headers: authH(token), body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) { setForm({ content: "" }); setEditing(null); flash(editing !== null ? "Updated" : "Rules saved"); load(); }
    else flash("Save failed", false);
  };
  const del = async (id: number) => { if (!confirm("Move this rule block to Trash? You can restore it within 30 days.")) return; await fetch(`${API}/rules/${id}`, { method: "DELETE", headers: authH(token) }); flash("Moved to Trash"); load(); };
  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div><h2>Rules & Regulations</h2><p>Create a category first, then add rule blocks under it.</p></div>
        <button type="button" className="pis-btn-ghost" onClick={() => setPreview(true)}><Eye size={14} /> Preview</button>
      </div>
      <div className="pis-card">
        <div className="pis-card-title">Categories</div>
        <div className="pis-cat-chips">
          {categories.map(cat => (<button key={cat} className={`pis-cat-chip${selectedCat === cat ? " active" : ""}`} onClick={() => { setSelectedCat(cat); setEditing(null); setForm({ content: "" }); }}>{cat}</button>))}
          {addingCat ? (
            <form onSubmit={createCat} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input className="pis-input" style={{ width: 200 }} placeholder="Category name…" value={newCatName} onChange={e => setNewCatName(e.target.value)} autoFocus required />
              <button type="submit" className="pis-btn-primary" style={{ padding: "6px 14px" }}>Create</button>
              <button type="button" className="pis-btn-ghost" style={{ padding: "6px 10px" }} onClick={() => setAddingCat(false)}><X size={14} /></button>
            </form>
          ) : (
            <button className="pis-cat-chip-add" onClick={() => setAddingCat(true)}><Plus size={14} /> New Category</button>
          )}
        </div>
      </div>
      {selectedCat && (
        <div className="pis-card">
          <form onSubmit={save}>
            <div className="pis-card-title">{editing !== null ? `Editing block in "${selectedCat}"` : `Add rules to "${selectedCat}"`}</div>
            <Field label="Rules" hint="One rule per line — each becomes a numbered item on the site">
              <textarea className="pis-textarea" rows={7} placeholder={"Students must wear full uniform at all times.\nAll shirts must be properly tucked in."} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} required />
            </Field>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving}>{saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> {editing !== null ? "Update" : "Save Rules"}</>}</button>
              {editing !== null && <button type="button" className="pis-btn-ghost" onClick={() => { setEditing(null); setForm({ content: "" }); }}>Cancel</button>}
            </div>
          </form>
        </div>
      )}
      {loading ? <SkeletonList rows={3} /> : categories.length === 0 && !addingCat ? (
        <EmptyState icon={<BookOpen size={24} />} title="No rule categories yet" body='Create a category above — like "Uniform" or "Conduct" — then add rule blocks under it.' />
      ) : (
        <>
          {Object.entries(grouped).map(([cat, rules]: [string, any[]]) => (
            <div key={cat} className="pis-rules-group">
              <div className="pis-rules-group-title">{cat}</div>
              {rules.map((rule: any) => (
                <div key={rule.id} className="pis-list-item">
                  <div className="pis-list-body">{parseContent(rule.content).map((r: string, i: number) => (<div key={i} style={{ fontSize: 13, color: "var(--pis-muted)" }}>{i + 1}. {r}</div>))}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="pis-btn-sm" aria-label={`Edit rule block in ${cat}`} onClick={() => { setSelectedCat(rule.category); setEditing(rule.id); setForm({ content: parseContent(rule.content).join("\n") }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Edit3 size={13} /></button>
                    <button className="pis-btn-danger-sm" aria-label={`Delete rule block in ${cat}`} onClick={() => del(rule.id)}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      <PreviewDrawer open={preview} onClose={() => setPreview(false)} title="Rules & Regulations">
        {categories.length === 0 ? <div className="pis-preview-empty">No rule categories added yet.</div> : (
          Object.entries(grouped).map(([cat, rules]: [string, any[]]) => (
            <div key={cat} style={{ marginBottom: 22 }}>
              <div className="pis-preview-section-head" style={{ marginBottom: 10 }}><h3 style={{ fontSize: 15 }}>{cat}</h3></div>
              {rules.map((rule: any) => (
                <ol key={rule.id} style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 13.5, color: "var(--pis-text)", lineHeight: 1.8 }}>
                  {parseContent(rule.content).map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ol>
              ))}
            </div>
          ))
        )}
      </PreviewDrawer>
    </div>
  );
}

// --- Admissions ---
function AdmissionsTab({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const load = useCallback(async () => { setLoading(true); const r = await fetch(`${API}/admissions`, { headers: authH(token) }); if (r.ok) setItems(await r.json()); setLoading(false); }, [token]);
  useEffect(() => { load(); }, [load]);
  const del = async (id: number) => { if (!confirm("Delete this admission submission permanently?")) return; await fetch(`${API}/admissions/${id}`, { method: "DELETE", headers: authH(token) }); flash("Deleted"); load(); };
  const unread = items.filter(i => !i.read).length;
  return (
    <div className="pis-content">
      <div className="pis-page-header"><div><h2>Admissions {unread > 0 && <span className="pis-badge-alert">{unread} new</span>}</h2><p>All admission enquiries submitted through the Apply page.</p></div></div>
      {loading ? <SkeletonList rows={4} /> : items.length === 0 ? (
        <EmptyState icon={<Inbox size={24} />} title="No admission submissions yet" body="Enquiries submitted through the public Apply page will show up here." />
      ) : (
      <div className="pis-list">
        {items.map(sub => {
          const fullName = `${sub.student_first_name || ""} ${sub.student_last_name || ""}`.trim() || "Unnamed";
          return (
          <div key={sub.id} className={`pis-submission${!sub.read ? " pis-submission-unread" : ""}`}>
            <div className="pis-submission-head" onClick={async () => { setExpanded(expanded === sub.id ? null : sub.id); if (!sub.read) { await fetch(`${API}/admissions/${sub.id}/read`, { method: "PUT", headers: authH(token) }); load(); } }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {!sub.read && <span className="pis-unread-dot" />}
                <div>
                  <strong style={{ display: "block", fontSize: 14 }}>{fullName}</strong>
                  <span style={{ fontSize: 12.5, color: "var(--pis-muted)" }}>{sub.class_applying || "—"} · Parent: {sub.parent_name || "—"} · {sub.phone || "—"}</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--pis-muted)" }}>{new Date(sub.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span>
                <ChevronRight size={16} style={{ color: "var(--pis-muted)", transform: expanded === sub.id ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
              </div>
            </div>
            {expanded === sub.id && (
              <div className="pis-submission-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", fontSize: 13, marginBottom: 16 }}>
                  {[["Student", fullName], ["Class", sub.class_applying], ["Date of Birth", sub.date_of_birth], ["Gender", sub.gender], ["Nationality", sub.nationality], ["Previous School", sub.prev_school], ["Parent / Guardian", sub.parent_name], ["Relationship", sub.relationship], ["Phone", sub.phone], ["Email", sub.email], ["Reference", sub.ref]].map(([label, value]) => value ? (
                    <div key={label}><span style={{ color: "var(--pis-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</span><div style={{ marginTop: 2 }}>{value}</div></div>
                  ) : null)}
                </div>
                {sub.message && <p style={{ fontSize: 13.5, lineHeight: 1.7, background: "var(--pis-surface-alt)", borderRadius: 8, padding: 12, marginBottom: 14 }}>{sub.message}</p>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {sub.filename && <a href={`/api/admissions/download/${sub.filename}`} target="_blank" rel="noreferrer" className="pis-btn-primary" style={{ textDecoration: "none", fontSize: 12.5, padding: "6px 14px" }}>Download PDF</a>}
                  {sub.email && <a href={`mailto:${sub.email}?subject=Re: Admission Enquiry [${sub.ref || ""}]`} className="pis-btn-ghost" style={{ fontSize: 12.5, padding: "6px 14px" }}>Reply via Email</a>}
                  {sub.phone && <a href={`https://wa.me/${sub.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="pis-btn-ghost" style={{ fontSize: 12.5, padding: "6px 14px" }}>WhatsApp</a>}
                  <button className="pis-btn-danger-sm" onClick={() => del(sub.id)}><Trash2 size={13} /> Delete</button>
                </div>
              </div>
            )}
          </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

// --- Submissions (Contact form) ---
function SubmissionsTab({ token }: { token: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const load = useCallback(async () => { setLoading(true); const r = await fetch(`${API}/submissions`, { headers: authH(token) }); if (r.ok) { const data = await r.json(); setItems(data); const nm: Record<number, string> = {}; data.forEach((s: any) => { nm[s.id] = s.notes || ""; }); setNotes(nm); } setLoading(false); }, [token]);
  useEffect(() => { load(); }, [load]);
  const markRead = async (id: number) => { await fetch(`${API}/submissions/${id}/read`, { method: "PUT", headers: authH(token) }); load(); };
  const del = async (id: number) => { if (!confirm("Delete?")) return; await fetch(`${API}/submissions/${id}`, { method: "DELETE", headers: authH(token) }); flash("Deleted"); load(); };
  const saveNote = async (id: number) => { await fetch(`${API}/submissions/${id}/notes`, { method: "PUT", headers: authH(token), body: JSON.stringify({ notes: notes[id] ?? "" }) }); flash("Note saved"); };
  const unread = items.filter(i => !i.read).length;
  return (
    <div className="pis-content">
      <div className="pis-page-header"><div><h2>Contact Enquiries {unread > 0 && <span className="pis-badge-alert">{unread} new</span>}</h2><p>Messages sent from the Contact page. Click any message to expand it.</p></div></div>
      {loading ? <SkeletonList rows={4} /> : items.length === 0 ? (
        <EmptyState icon={<MessageSquare size={24} />} title="No enquiries yet" body="Messages sent through the public Contact page will show up here." />
      ) : (
      <div className="pis-list">
        {items.map(sub => (
          <div key={sub.id} className={`pis-submission${!sub.read ? " pis-submission-unread" : ""}`}>
            <div className="pis-submission-head" onClick={() => { setExpanded(expanded === sub.id ? null : sub.id); if (!sub.read) markRead(sub.id); }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {!sub.read && <span className="pis-unread-dot" />}
                <div>
                  <strong style={{ display: "block" }}>{sub.name}</strong>
                  <span style={{ fontSize: 13, color: "var(--pis-muted)" }}>{sub.email} {sub.phone && `· ${sub.phone}`} {sub.subject && <span className="pis-badge-sm">{sub.subject}</span>}</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--pis-muted)" }}>{new Date(sub.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span>
                <ChevronRight size={16} style={{ color: "var(--pis-muted)", transform: expanded === sub.id ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
              </div>
            </div>
            {expanded === sub.id && (
              <div className="pis-submission-body">
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--pis-text)", marginBottom: 16, background: "var(--pis-surface-alt)", borderRadius: 8, padding: 14 }}>{sub.message}</p>
                <Field label="Internal Notes" hint="private — not visible to sender">
                  <textarea className="pis-textarea" rows={2} value={notes[sub.id] ?? ""} onChange={e => setNotes(n => ({ ...n, [sub.id]: e.target.value }))} placeholder="Add a private note…" />
                </Field>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="pis-btn-sm" onClick={() => saveNote(sub.id)}><Save size={13} /> Save Note</button>
                  <a href={`mailto:${sub.email}?subject=Re: ${sub.subject || "Your Enquiry"}`} className="pis-btn-primary" style={{ textDecoration: "none", fontSize: 13, padding: "6px 14px" }}>Reply via Email</a>
                  <button className="pis-btn-danger-sm" onClick={() => del(sub.id)}><Trash2 size={13} /> Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

// --- Settings ---
function SettingsTab({ token, onPasswordChanged, dark, toggleDark }: { token: string; onPasswordChanged: () => void; dark: boolean; toggleDark: () => void }) {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { flash("Passwords don't match", false); return; }
    if (newPw.length < 6) { flash("Password must be at least 6 characters", false); return; }
    setSaving(true);
    const r = await fetch(`${API}/change-password`, { method: "POST", headers: authH(token), body: JSON.stringify({ newPassword: newPw }) });
    setSaving(false);
    if (r.ok) { flash("Password changed — signing you out…"); setNewPw(""); setConfirmPw(""); setTimeout(onPasswordChanged, 2000); }
    else flash("Failed to change password", false);
  };
  return (
    <div className="pis-content">
      <div className="pis-page-header"><div><h2>Settings</h2><p>Dashboard preferences and security settings.</p></div></div>

      <div className="pis-card">
        <div className="pis-card-title">Appearance</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Dark Mode</div>
            <div style={{ fontSize: 13, color: "var(--pis-muted)" }}>Switch between light and dark dashboard theme</div>
          </div>
          <button className={`pis-toggle${dark ? " pis-toggle--on" : ""}`} onClick={toggleDark} aria-label="Toggle dark mode">
            <div className="pis-toggle-thumb">{dark ? <Moon size={12} /> : <Sun size={12} />}</div>
          </button>
        </div>
      </div>

      <div className="pis-card" style={{ maxWidth: 480 }}>
        <div className="pis-card-title">Change Admin Password</div>
        <form onSubmit={changePw}>
          <Field label="New Password" hint="minimum 6 characters"><input className="pis-input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required /></Field>
          <Field label="Confirm New Password"><input className="pis-input" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required /></Field>
          <button type="submit" className={`pis-btn-primary${saving ? " pis-btn--saving" : ""}`} disabled={saving} style={{ marginTop: 8 }}>
            {saving ? <><RefreshCw size={15} className="pis-spin" /> Saving…</> : <><Save size={15} /> Change Password</>}
          </button>
        </form>
      </div>

      <div className="pis-card" style={{ maxWidth: 480 }}>
        <div className="pis-card-title">About This Dashboard</div>
        <div style={{ fontSize: 13, color: "var(--pis-muted)", lineHeight: 1.8 }}>
          <div>School: <strong>Prudential International School</strong></div>
          <div>Location: <strong>Abuja, Nigeria</strong></div>
          <div>Website: <strong>prudentialschool.com.ng</strong></div>
          <div>Dashboard version: <strong>v3.0</strong></div>
        </div>
      </div>
    </div>
  );
}

// --- Main App ---
export default function AdminPage() {
  const { token, save, clear } = useToken();
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { dark, toggle: toggleDark } = useDarkMode();
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/hero`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (r.ok) setAuthed(true); else clear(); }).catch(() => {});
  }, []);

  const handleLogin = (t: string, remember: boolean = true) => { save(t, remember); setAuthed(true); };
  const handleLogout = () => { clear(); setAuthed(false); };

  if (!authed) return <LoginPage onLogin={handleLogin} />;

  const NAV_GROUPS = [
    { label: "Dashboard", tabs: [{ id: "overview" as Tab, label: "Overview", icon: <LayoutGrid size={16} /> }] },
    {
      label: "Pages",
      tabs: [
        { id: "hero" as Tab, label: "Homepage Hero", icon: <Home size={16} /> },
        { id: "features" as Tab, label: "Why We're Different", icon: <Star size={16} /> },
        { id: "campus" as Tab, label: "Campus Section", icon: <Building2 size={16} /> },
        { id: "about" as Tab, label: "About Page", icon: <BookOpen size={16} /> },
        { id: "divisions" as Tab, label: "Academic Divisions", icon: <GraduationCap size={16} /> },
        { id: "academics-content" as Tab, label: "Academics Content", icon: <BookOpen size={16} /> },
        { id: "values" as Tab, label: "Core Values", icon: <ShieldCheck size={16} /> },
        { id: "student-life" as Tab, label: "Student Life", icon: <Heart size={16} /> },
        { id: "portals" as Tab, label: "Portal Links", icon: <ExternalLink size={16} /> },
      ],
    },
    {
      label: "Media",
      tabs: [
        { id: "gallery-images" as Tab, label: "Gallery Photos", icon: <Images size={16} /> },
        { id: "gallery-videos" as Tab, label: "Gallery Videos", icon: <Video size={16} /> },
        { id: "anthem" as Tab, label: "Anthems", icon: <Music size={16} /> },
      ],
    },
    {
      label: "School",
      tabs: [
        { id: "staff" as Tab, label: "Meet the Team", icon: <Users size={16} /> },
        { id: "rules" as Tab, label: "Rules & Regs", icon: <ClipboardList size={16} /> },
        { id: "announcements" as Tab, label: "Announcements", icon: <Megaphone size={16} /> },
        { id: "events" as Tab, label: "Events", icon: <Calendar size={16} /> },
        { id: "testimonials" as Tab, label: "Testimonials", icon: <MessageSquare size={16} /> },
      ],
    },
    {
      label: "Admin",
      tabs: [
        { id: "contact" as Tab, label: "Contact Info", icon: <Phone size={16} /> },
        { id: "admissions" as Tab, label: "Admissions", icon: <Inbox size={16} /> },
        { id: "submissions" as Tab, label: "Enquiries", icon: <FileText size={16} /> },
        { id: "share" as Tab, label: "Share & Protect", icon: <ShieldCheck size={16} /> },
        { id: "trash" as Tab, label: "Trash", icon: <Trash2 size={16} /> },
        { id: "settings" as Tab, label: "Settings", icon: <Settings size={16} /> },
      ],
    },
  ];

  const paletteItems: PaletteItem[] = NAV_GROUPS.flatMap(g => g.tabs.map(t => ({ id: t.id, label: t.label, group: g.label, icon: t.icon })));

  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const navigateTo = (t: Tab) => { guardNavigate(() => { setTab(t); setSidebarOpen(false); window.scrollTo({ top: 0 }); }); };

  return (
    <div className="pis-wrap">
      <ToastContainer />

      <header className="pis-topbar">
        <div className="pis-topbar-left">
          <button className="pis-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">
            <span /><span /><span />
          </button>
          <img src="https://res.cloudinary.com/dagt2a1w0/image/upload/v1773768204/ChatGPT_Image_Jan_31__2026__04_03_54_AM_1769828712771_d65sw2.png" alt="PIS" className="pis-topbar-logo" />
          <div className="pis-topbar-brand">
            <span>Prudential International School</span>
            <span>Admin Dashboard</span>
          </div>
        </div>
        <div className="pis-topbar-right">
          <CommandPaletteHint />
          <button className="pis-topbar-icon-btn" onClick={toggleDark} title={dark ? "Switch to light mode" : "Switch to dark mode"} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <a href="/" target="_blank" rel="noreferrer" className="pis-topbar-btn">
            <Eye size={14} /> View Site
          </a>
          <button className="pis-topbar-btn pis-topbar-logout" onClick={handleLogout}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </header>

      <div className="pis-body">
        {sidebarOpen && <div className="pis-overlay" onClick={() => setSidebarOpen(false)} />}

        <aside className={`pis-sidebar${sidebarOpen ? " pis-sidebar-open" : ""}`}>
          <nav className="pis-nav">
            {NAV_GROUPS.map(group => (
              <div key={group.label} className="pis-nav-group">
                <div className="pis-nav-group-label">{group.label}</div>
                {group.tabs.map(t => (
                  <button key={t.id} className={`pis-nav-item${tab === t.id ? " pis-nav-active" : ""}`} onClick={() => navigateTo(t.id)}>
                    <span className="pis-nav-icon">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <main className="pis-main">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: "easeOut" }}
            >
              {tab === "overview"          && <OverviewTab          token={token} setTab={setTab} />}
              {tab === "gallery-images"     && <GalleryTab           token={token} mediaType="image" />}
              {tab === "gallery-videos"     && <GalleryTab           token={token} mediaType="video" />}
              {tab === "announcements"     && <AnnouncementsTab     token={token} />}
              {tab === "events"            && <EventsTab            token={token} />}
              {tab === "testimonials"      && <TestimonialsTab      token={token} />}
              {tab === "hero"              && <HeroTab              token={token} />}
              {tab === "about"             && <AboutTab             token={token} />}
              {tab === "contact"           && <ContactTab           token={token} />}
              {tab === "values"            && <ValuesTab            token={token} />}
              {tab === "divisions"         && <DivisionsTab         token={token} />}
              {tab === "academics-content" && <AcademicsContentTab  token={token} />}
              {tab === "features"          && <FeaturesTab          token={token} />}
              {tab === "campus"            && <CampusTab            token={token} />}
              {tab === "student-life"      && <StudentLifeTab       token={token} />}
              {tab === "portals"           && <PortalsTab           token={token} />}
              {tab === "anthem"            && <AnthemTab            token={token} />}
              {tab === "staff"             && <StaffTab             token={token} />}
              {tab === "rules"             && <RulesTab             token={token} />}
              {tab === "admissions"        && <AdmissionsTab        token={token} />}
              {tab === "submissions"       && <SubmissionsTab       token={token} />}
              {tab === "trash"             && <TrashTab             token={token} />}
              {tab === "share"             && <ShareTab />}
              {tab === "settings"          && <SettingsTab          token={token} onPasswordChanged={handleLogout} dark={dark} toggleDark={toggleDark} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {paletteOpen && (
        <CommandPalette items={paletteItems} onNavigate={navigateTo} onClose={() => setPaletteOpen(false)} />
      )}
    </div>
  );
}
