import React, { useRef } from "react";
import { QrCode, Share2, Download, Copy, ExternalLink, History, User, Globe, ShieldCheck } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { flash } from "../AdminPage";

const SCHOOL_LOGO_URL = "https://res.cloudinary.com/dagt2a1w0/image/upload/v1773768204/ChatGPT_Image_Jan_31__2026__04_03_54_AM_1769828712771_d65sw2.png";

function AuditLogs() {
  const logs = [
    { id: 1, action: "Updated Homepage Hero", user: "Admin", time: "2 hours ago", ip: "192.168.1.1" },
    { id: 2, action: "Added New Staff Member", user: "Admin", time: "5 hours ago", ip: "192.168.1.1" },
    { id: 3, action: "Changed School Rules", user: "Admin", time: "Yesterday", ip: "102.89.2.45" },
    { id: 4, action: "System Login", user: "Admin", time: "2 days ago", ip: "102.89.2.45" },
  ];

  return (
    <div className="pis-card" style={{ padding: 0, overflow: "hidden", marginTop: 40 }}>
      <div style={{ padding: 24, borderBottom: "1px solid var(--pis-border)", display: "flex", alignItems: "center", gap: 12 }}>
        <History size={20} className="pis-accent" />
        <h3 style={{ margin: 0, fontSize: 18 }}>System Audit Logs</h3>
      </div>
      <div style={{ padding: 8 }}>
        {logs.map(log => (
          <div key={log.id} style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 20, borderBottom: "1px solid var(--pis-border)" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <User size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{log.action}</div>
              <div style={{ fontSize: 12, color: "var(--pis-text-dim)" }}>by {log.user} · {log.time}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pis-text-dim)", textTransform: "uppercase" }}>IP Address</div>
              <div style={{ fontSize: 12 }}>{log.ip}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: 20, background: "rgba(255,255,255,0.02)", textAlign: "center" }}>
        <button className="pis-btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
          View Full History <Globe size={14} />
        </button>
      </div>
    </div>
  );
}

export default function ShareTab() {
  const siteUrl = "https://prudentialschool.com.ng";
  const qrCanvasWrapRef = useRef<HTMLDivElement>(null);

  const copyLink = () => {
    navigator.clipboard.writeText(siteUrl);
    flash("Website link copied to clipboard!");
  };

  const downloadQr = () => {
    const canvas = qrCanvasWrapRef.current?.querySelector("canvas");
    if (!canvas) { flash("QR code isn't ready yet — try again in a moment", false); return; }
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "PIS_QR_Code.png";
    link.click();
    flash("QR code downloaded");
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
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button onClick={downloadQr} className="pis-btn-primary">
              <Download size={16} /> Download High-Res PNG
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
            <h4 style={{ margin: "0 0 12px" }}>Security Features Active</h4>
            <p style={{ fontSize: 14, color: "var(--pis-text-dim)", lineHeight: 1.6, marginBottom: 24 }}>
              Your website is protected by military-grade security headers, rate limiting, and honeypot traps. All submissions are logged and monitored.
            </p>
            <button className="pis-btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
              View Security Logs <ExternalLink size={14} />
            </button>
          </div>
        </div>
      </div>
      
      <AuditLogs />
    </div>
  );
}
