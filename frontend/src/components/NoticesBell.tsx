import { useEffect, useState } from "react";
import { Bell, Megaphone, Calendar, MapPin, X, ChevronRight } from "lucide-react";

interface Announcement { id: number; title: string; body: string; image_url?: string; created_at: string; }
interface EventItem { id: number; title: string; description?: string; event_date: string; location?: string; image_url?: string; }

type Notice =
  | { kind: "announcement"; id: number; title: string; body: string; image_url?: string; sortDate: string }
  | { kind: "event"; id: number; title: string; body?: string; location?: string; image_url?: string; sortDate: string };

function formatDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isUpcoming(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today;
}

export default function NoticesBell() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Notice | null>(null);
  const [seenCount, setSeenCount] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/cms/announcements").then(r => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/cms/events").then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([anns, evts]: [Announcement[], EventItem[]]) => {
      const annNotices: Notice[] = (anns || []).map(a => ({
        kind: "announcement", id: a.id, title: a.title, body: a.body, image_url: a.image_url, sortDate: a.created_at,
      }));
      const evtNotices: Notice[] = (evts || [])
        .filter(e => isUpcoming(e.event_date))
        .map(e => ({
          kind: "event", id: e.id, title: e.title, body: e.description, location: e.location, image_url: e.image_url, sortDate: e.event_date,
        }));
      const merged = [
        ...annNotices.sort((a, b) => (a.sortDate < b.sortDate ? 1 : -1)),
        ...evtNotices.sort((a, b) => (a.sortDate < b.sortDate ? -1 : 1)),
      ];
      setNotices(merged.slice(0, 12));

      const seenKey = "pis_notices_seen";
      const seen = Number(localStorage.getItem(seenKey) || "0");
      setSeenCount(seen);
    });
  }, []);

  const unseenCount = Math.max(0, notices.length - seenCount);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      localStorage.setItem("pis_notices_seen", String(notices.length));
      setSeenCount(notices.length);
    }
  };

  if (notices.length === 0) return null;

  return (
    <>
      <button className="notices-fab" onClick={toggleOpen} aria-label="View announcements and events">
        <Bell size={20} />
        {unseenCount > 0 && <span className="notices-fab-badge">{unseenCount > 9 ? "9+" : unseenCount}</span>}
      </button>

      {open && (
        <div className="notices-overlay" onClick={() => setOpen(false)}>
          <div className="notices-panel" onClick={e => e.stopPropagation()}>
            <div className="notices-panel-header">
              <span><Bell size={16} /> Notices</span>
              <button onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="notices-panel-list">
              {notices.map(n => (
                <button key={`${n.kind}-${n.id}`} className="notices-item" onClick={() => setActive(n)}>
                  {n.image_url ? (
                    <img src={n.image_url} alt="" className="notices-item-thumb" />
                  ) : (
                    <span className={`notices-item-icon notices-item-icon-${n.kind}`}>
                      {n.kind === "event" ? <Calendar size={16} /> : <Megaphone size={16} />}
                    </span>
                  )}
                  <span className="notices-item-body">
                    <span className="notices-item-tag">{n.kind === "event" ? "Event" : "Announcement"}</span>
                    <span className="notices-item-title">{n.title}</span>
                    <span className="notices-item-date">{formatDate(n.sortDate)}</span>
                  </span>
                  <ChevronRight size={15} className="notices-item-chevron" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {active && (
        <div className="notices-modal-overlay" onClick={() => setActive(null)}>
          <div className="notices-modal" onClick={e => e.stopPropagation()}>
            <button className="notices-modal-close" onClick={() => setActive(null)} aria-label="Close">
              <X size={18} />
            </button>
            <span className={`notices-modal-tag notices-modal-tag-${active.kind}`}>
              {active.kind === "event" ? <Calendar size={13} /> : <Megaphone size={13} />}
              {active.kind === "event" ? "Event" : "Announcement"}
            </span>
            <h3>{active.title}</h3>
            <div className="notices-modal-meta">
              <span>{formatDate(active.sortDate)}</span>
              {active.kind === "event" && active.location && <span><MapPin size={13} /> {active.location}</span>}
            </div>
            {active.body && <p className="notices-modal-body">{active.body}</p>}
            {active.image_url && (
              <img src={active.image_url} alt={active.title} className="notices-modal-img" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
