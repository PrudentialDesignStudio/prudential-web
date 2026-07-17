import { useState, useEffect } from "react";
import AnimateIn from "@/components/AnimateIn";

const DEFAULT_PORTALS = [
  {
    id: 1,
    title: "Student Portal",
    description: "Access your timetable, results, assignments, and academic records.",
    tag: "Students",
    url: "https://login.edumgrsolutions.com/login.html",
    color: "#003366",
  },
  {
    id: 2,
    title: "Parent Portal",
    description: "Monitor your child's attendance, fees, and school communications.",
    tag: "Parents",
    url: "https://login.edumgrsolutions.com/parent.html",
    color: "#cc0000",
  },
  {
    id: 3,
    title: "Staff Portal",
    description: "Manage classes, upload results, submit reports, and access admin tools.",
    tag: "Staff",
    url: "https://login.edumgrsolutions.com/staff.html",
    color: "#15803d",
  },
];

const PORTAL_ICONS: Record<string, JSX.Element> = {
  Students: (
    <svg width="30" height="30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
    </svg>
  ),
  Parents: (
    <svg width="30" height="30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  Staff: (
    <svg width="30" height="30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
    </svg>
  ),
};

const EXTERNAL_ICON = (
  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
  </svg>
);

interface Portal {
  id: number;
  title: string;
  description: string;
  tag: string;
  url: string;
  color: string;
}

export default function PortalPage() {
  const [portals, setPortals] = useState<Portal[]>(DEFAULT_PORTALS);

  useEffect(() => {
    fetch("/api/cms/portals")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.length) {
          setPortals(d.map((p: Portal & { active?: unknown }) => {
            // Destructure out any `active` field the CMS might return.
            const { active: _discard, ...rest } = p;
            return rest;
          }));
        }
      })
      .catch(() => {});
  }, []);

  // Portals are a different login system on a different domain — opening
  // them in a new tab is both more reliable (no iframe/cookie/clickjacking
  // issues) and more honest about the fact you're leaving the school site.
  const handleEnter = (portal: Portal) => {
    window.open(portal.url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      {/* HERO */}
      <section className="portal-hero">
        <div className="portal-hero-bg" />
        <div className="pis-container">
          <AnimateIn className="portal-hero-content">
            <span
              className="ey"
              style={{ color: "rgba(255,255,255,.6)", marginBottom: 12, display: "block" }}
            >
              Secure Access Gateway
            </span>
            <h1 style={{ color: "#fff" }}>School Portals</h1>
            <p style={{ color: "rgba(255,255,255,.6)", maxWidth: 480, margin: "0 auto" }}>
              Choose your portal below. Each one opens securely in a new tab on its own login system.
            </p>
          </AnimateIn>
        </div>
      </section>

      <section className="portal-section">
        <div className="pis-container">
          <div className="journey-grid portal-journey-grid">
            {portals.map((p, i) => (
              <AnimateIn key={p.title} delay={((i % 3) + 1) as 1 | 2 | 3} className="journey-card">
                <div className="journey-connector" style={{ background: p.color }} />
                <div className="journey-icon-wrap" style={{ background: p.color + "18", color: p.color }}>
                  {PORTAL_ICONS[p.tag] ?? PORTAL_ICONS["Students"]}
                  <span className="journey-step-num" style={{ color: p.color }}>{i + 1}</span>
                </div>
                <span className="journey-age" style={{ color: p.color }}>{p.tag}</span>
                <h3 className="journey-title">{p.title}</h3>
                <p className="journey-desc">{p.description}</p>
                <button
                  className="journey-card-btn"
                  style={{ background: p.color }}
                  onClick={() => handleEnter(p)}
                >
                  Enter Portal {EXTERNAL_ICON}
                </button>
              </AnimateIn>
            ))}
          </div>

          <AnimateIn className="portal-note">
            <svg
              width="15"
              height="15"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
            Each portal opens in a new tab on its own secure login system. For login issues, contact the school
            office on{" "}
            <a
              href="tel:+2348095700591"
              style={{ color: "var(--pis-primary)", fontWeight: 600 }}
            >
              +234 809 570 0591
            </a>
            .
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
