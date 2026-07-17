import React, { useRef, useState, useEffect, useCallback } from "react";
import { QrCode, Share2, Download, Copy, ExternalLink, History, User, Globe, ShieldCheck, RefreshCw } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { flash, API, authH } from "../AdminPage";

const SCHOOL_LOGO_URL = "https://res.cloudinary.com/dagt2a1w0/image/upload/v1773768204/ChatGPT_Image_Jan_31__2026__04_03_54_AM_1769828712771_d65sw2.png";

interface AuditRow { id: number; username: string | null; action: string; detail: string | null; ip_address: string | null; created_at: string }

// Turns raw actions ("login", "POST /api/admin/gallery/12") into something a
// human reads at a glance, without inventing details that aren't in the row.
function describeAction(a: AuditRow): string {
  const known: Record<string, string> = {
    login: "Signed in",
    login_failed: "Failed sign-in attempt",
    password_changed: "Changed their password",
    password_reset_requested: "Requested a password reset",
    password_reset_completed: "Completed a password reset",
    account_created: "Created an admin account",
    account_updated: "Updated an admin account",
    account_deleted: "Removed an admin account",
  };
  if (known[a.action]) return known[a.action] + (a.detail ? ` — ${a.detail}` : "");

  const m = a.action.match(/^(GET|POST|PUT|PATCH|DELETE)\s+\/api\/admin\/([a-z0-9-]+)/i);
  if (m) {
    const verb = { POST: "Created/updated", PUT: "Updated", PATCH: "Updated", DELETE: "Deleted", GET: "Viewed" }[m[1].toUpperCase()] || m[1];
    const resource = m[2].replace(/-/g, " ");
    return `${verb} ${resource}`;
  }
  return a.action;
}

function timeAgoLocal(dateStr: string) {
  const d = new Date(dateStr.includes("Z") || dateStr.includes("+") ? dateStr : dateStr + "Z").getTime();
  if (isNaN(d)) return dateStr;
  const diff = Math.max(0, Date.now() - d);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function AuditLogs({ token }: { token: string }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(8);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const load = useCallback(async (n: number) => {
    setLoading(true); setErr(false);
    try {
      const r = await fetch(`${API}/audit-logs?limit=${n}`, { headers: authH(token) });
      if (!r.ok) { setErr(true); return; }
      const d = await r.json();
      setRows(d.rows); setTotal(d.total);
    } catch { setErr(true); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(limit); }, [load, limit]);

  return (
    <div className="pis-card" style={{ padding: 0, overflow: "hidden", marginTop: 40 }} id="audit-logs">
      <div style={{ padding: 24, borderBottom: "1px solid var(--pis-border)", display: "flex", alignItems: "center", gap: 12 }}>
        <History size={20} className="pis-accent" />
        <h3 style={{ margin: 0, fontSize: 18 }}>Security Audit Log</h3>
        <button onClick={() => load(limit)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--pis-text-dim)" }} aria-label="Refresh" title="Refresh">
          <RefreshCw size={16} className={loading ? "pis-spin" : ""} />
        </button>
      </div>
      <div style={{ padding: 8 }}>
        {err && <div style={{ padding: 20, fontSize: 13, color: "var(--pis-text-dim)" }}>Couldn't load the audit log. Try refreshing.</div>}
        {!err && !loading && rows.length === 0 && <div style={{ padding: 20, fontSize: 13, color: "var(--pis-text-dim)" }}>No activity recorded yet.</div>}
        {rows.map(log => (
          <div key={log.id} style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 20, borderBottom: "1px solid var(--pis-border)" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <User size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{describeAction(log)}</div>
              <div style={{ fontSize: 12, color: "var(--pis-text-dim)" }}>by {log.username || "unknown"} · {timeAgoLocal(log.created_at)}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pis-text-dim)", textTransform: "uppercase" }}>IP Address</div>
              <div style={{ fontSize: 12 }}>{log.ip_address || "—"}</div>
            </div>
          </div>
        ))}
      </div>
      {rows.length < total && (
        <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", textAlign: "center" }}>
          <button className="pis-btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => setLimit(l => l + 25)} disabled={loading}>
            View Full History ({total - rows.length} more) <Globe size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ShareTab({ token }: { token: string }) {
  const siteUrl = "https://prudentialschool.com.ng";
  const qrCanvasWrapRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(siteUrl);
    flash("Website link copied to clipboard!");
  };

  const getQrCanvas = (): HTMLCanvasElement | null => qrCanvasWrapRef.current?.querySelector("canvas") ?? null;

  const downloadQr = () => {
    const canvas = getQrCanvas();
    if (!canvas) { flash("QR code isn't ready yet — try again in a moment", false); return; }
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "PIS_QR_Code.png";
    link.click();
    flash("QR code downloaded");
  };

  // Shares the actual QR image where the platform supports sharing files
  // (most phones); falls back to sharing/copying the plain link everywhere
  // else, rather than silently doing nothing.
  const shareQr = async () => {
    const canvas = getQrCanvas();
    if (!canvas) { flash("QR code isn't ready yet — try again in a moment", false); return; }
    setSharing(true);
    try {
      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if (blob && (navigator as any).canShare) {
        const file = new File([blob], "PIS_QR_Code.png", { type: "image/png" });
        if ((navigator as any).canShare({ files: [file] })) {
          await (navigator as any).share({
            files: [file],
            title: "Prudential International School",
            text: "Scan to visit Prudential International School online.",
          });
          setSharing(false);
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ title: "Prudential International School", text: "Visit us online:", url: siteUrl });
        setSharing(false);
        return;
      }
      copyLink();
    } catch (err: any) {
      // AbortError just means the person closed the native share sheet -- not a failure.
      if (err?.name !== "AbortError") flash("Couldn't open the share sheet — link copied instead", false);
      if (err?.name !== "AbortError") copyLink();
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="pis-content">
      <div style={{ marginBottom: 32 }}>
        <span className="pis-bento-label">Connect</span>
        <h2 className="pis-bento-title">Share the School</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        {/* QR CODE CARD */}
        <div className="pis-card" style={{ padding: 40, textAlign: "center" }}>
          <div
            ref={qrCanvasWrapRef}
            style={{
              background: "#050a18",
              padding: 32,
              borderRadius: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--pis-accent)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              marginBottom: 24
            }}
          >
            <QRCodeCanvas
              value={siteUrl}
              size={800}
              bgColor="#050a18"
              fgColor="#d4af37"
              level="H"
              imageSettings={{
                src: SCHOOL_LOGO_URL,
                height: 160,
                width: 160,
                excavate: true,
              }}
              style={{ width: 240, height: 240 }}
            />
          </div>
          <h3 style={{ fontSize: 24, marginBottom: 8 }}>Branded QR Code</h3>
          <p style={{ color: "var(--pis-text-dim)", marginBottom: 32 }}>
            Custom generated in Navy &amp; Gold with the school crest at the center. Perfect for print brochures, posters, and business cards.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={downloadQr} className="pis-btn-primary">
              <Download size={16} /> Download High-Res PNG
            </button>
            <button onClick={shareQr} className="pis-btn-ghost" disabled={sharing}>
              {sharing ? <RefreshCw size={16} className="pis-spin" /> : <Share2 size={16} />} Share QR Code
            </button>
          </div>
        </div>

        {/* QUICK LINKS CARD */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="pis-card" style={{ padding: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(212, 175, 55, 0.1)", color: "var(--pis-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Share2 size={20} />
              </div>
              <div>
                <h4 style={{ margin: 0 }}>Public Website Link</h4>
                <p style={{ margin: 0, fontSize: 13, color: "var(--pis-text-dim)" }}>Share this with prospective parents</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, background: "rgba(0,0,0,0.2)", padding: 12, borderRadius: 12, border: "1px solid var(--pis-border)" }}>
              <code style={{ flex: 1, color: "var(--pis-accent)", alignSelf: "center" }}>{siteUrl}</code>
              <button onClick={copyLink} style={{ background: "none", border: "none", color: "var(--pis-text-dim)", cursor: "pointer" }}>
                <Copy size={18} />
              </button>
            </div>
          </div>

          <div className="pis-card" style={{ padding: 32, background: "linear-gradient(135deg, #0c1226, #1a2240)" }}>
            <h4 style={{ margin: "0 0 12px" }}>Security Measures Active</h4>
            <p style={{ fontSize: 14, color: "var(--pis-text-dim)", lineHeight: 1.6, marginBottom: 24 }}>
              Per-admin login accounts with hashed passwords, rate-limited sign-in attempts, and every admin action logged below with who, when, and from what IP.
            </p>
            <button className="pis-btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => document.getElementById("audit-logs")?.scrollIntoView({ behavior: "smooth" })}>
              View Security Logs <ExternalLink size={14} />
            </button>
          </div>
        </div>
      </div>

      <AuditLogs token={token} />
    </div>
  );
}
