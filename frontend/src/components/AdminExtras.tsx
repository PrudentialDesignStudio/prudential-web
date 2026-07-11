import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search, Command, RotateCcw, Trash2, X, RefreshCw, GripVertical, Eye, EyeOff,
} from "lucide-react";
import { API, authH, flash, type Tab } from "../pages/AdminPage";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, DragOverlay,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, rectSortingStrategy,
  useSortable, arrayMove, sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* ════════════════════════════════════════════════════════════════════
   DRAG-TO-REORDER (Round 4)
   Built on @dnd-kit — not react-beautiful-dnd, which is unmaintained.
   Keyboard-accessible by default: KeyboardSensor + sortableKeyboardCoordinates
   let any sortable item be picked up and moved with Space/Enter + arrow keys,
   not just a mouse. Every reorderable tab (Gallery, Testimonials, Staff,
   Values, Divisions) shares this one implementation rather than each
   hand-rolling its own DndContext wiring.
   ════════════════════════════════════════════════════════════════════ */

// Wraps one sortable item. Exposes drag-handle props via render-prop so each
// tab's existing card/row markup barely has to change — just add a handle.
function SortableItem({ id, children }: { id: number; children: (opts: { dragHandleProps: Record<string, any>; isDragging: boolean }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: { duration: 220, easing: "cubic-bezier(.4,0,.2,1)" },
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandleProps: { ...attributes, ...listeners }, isDragging })}
    </div>
  );
}

export function DragHandle(props: Record<string, any>) {
  return (
    <button type="button" className="pis-drag-handle" aria-label="Drag to reorder" {...props}>
      <GripVertical size={16} />
    </button>
  );
}

// Optimistic reorder: moves the item locally first (so the UI feels instant),
// then persists via PUT .../reorder. On failure, reverts to the pre-drag
// order and flashes an error — same save→feedback pattern as everywhere else.
function useReorder<T extends { id: number }>(items: T[], setItems: (items: T[]) => void, endpoint: string, token: string) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = useCallback(async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const previous = items;
    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);
    try {
      const r = await fetch(endpoint, { method: "PUT", headers: authH(token), body: JSON.stringify({ ids: reordered.map(i => i.id) }) });
      if (r.ok) flash("Order saved");
      else { flash("Could not save order — reverted", false); setItems(previous); }
    } catch {
      flash("Could not save order — reverted", false); setItems(previous);
    }
  }, [items, setItems, endpoint, token]);
  return { sensors, onDragEnd };
}

// Drop-in sortable wrapper. `strategy="grid"` for card grids (Gallery,
// Testimonials, Staff), `strategy="list"` for stacked rows (Values, Divisions).
// Pass the existing container className so layout CSS is untouched.
export function SortableCollection<T extends { id: number }>({
  items, setItems, endpoint, token, strategy = "grid", containerClassName, children,
}: {
  items: T[];
  setItems: (items: T[]) => void;
  endpoint: string;
  token: string;
  strategy?: "grid" | "list";
  containerClassName?: string;
  children: (item: T, opts: { dragHandleProps: Record<string, any>; isDragging: boolean }) => React.ReactNode;
}) {
  const { sensors, onDragEnd } = useReorder(items, setItems, endpoint, token);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeRect, setActiveRect] = useState<{ width: number; height: number } | null>(null);
  const activeItem = activeId != null ? items.find(i => i.id === activeId) ?? null : null;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e: DragStartEvent) => {
        setActiveId(e.active.id as number);
        const r = e.active.rect.current.initial;
        setActiveRect(r ? { width: r.width, height: r.height } : null);
      }}
      onDragEnd={(e: DragEndEvent) => { setActiveId(null); onDragEnd(e); }}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={items.map(i => i.id)} strategy={strategy === "grid" ? rectSortingStrategy : verticalListSortingStrategy}>
        <div className={containerClassName}>
          {items.map(item => (
            <SortableItem key={item.id} id={item.id}>
              {opts => children(item, opts)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.4,0,.2,1)" }}>
        {activeItem ? (
          <div className="pis-drag-overlay" style={activeRect ? { width: activeRect.width, height: activeRect.height } : undefined}>
            {children(activeItem, { dragHandleProps: {}, isDragging: true })}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ════════════════════════════════════════════════════════════════════
   BULK ACTIONS — Gallery & Staff only (per Round 4 scope)
   Multi-select via checkboxes, then publish / unpublish / delete as a
   batch. Batch delete routes through the same Trash system as a single
   delete — there is no separate hard-delete path.
   ════════════════════════════════════════════════════════════════════ */
export function useBulkSelect() {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = useCallback((id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const isSelected = useCallback((id: number) => selected.has(id), [selected]);
  return { selected, toggle, clear, isSelected, count: selected.size };
}

export function BulkToolbar({ count, busy, onPublish, onUnpublish, onDelete, onClear }: {
  count: number;
  busy?: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="pis-bulk-toolbar" role="toolbar" aria-label="Bulk actions">
      <span className="pis-bulk-count">{count} selected</span>
      <div className="pis-bulk-actions">
        <button type="button" className="pis-btn-sm" disabled={busy} onClick={onPublish}><Eye size={13} /> Publish</button>
        <button type="button" className="pis-btn-sm" disabled={busy} onClick={onUnpublish}><EyeOff size={13} /> Unpublish</button>
        <button type="button" className="pis-btn-danger-sm" disabled={busy} onClick={onDelete}><Trash2 size={13} /> Move to Trash</button>
        <button type="button" className="pis-btn-ghost" disabled={busy} onClick={onClear}><X size={13} /> Clear</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SKELETON LOADING STATES
   Shapes mirror the real content so the layout doesn't jump once data
   actually arrives — a plain spinner doesn't do that.
   ════════════════════════════════════════════════════════════════════ */
export function Skeleton({ w, h, r = 8, style }: { w?: string | number; h?: string | number; r?: number; style?: React.CSSProperties }) {
  return <div className="pis-skel" style={{ width: w ?? "100%", height: h ?? 16, borderRadius: r, ...style }} />;
}

export function SkeletonCard() {
  return (
    <div className="pis-card">
      <Skeleton w={120} h={13} style={{ marginBottom: 18 }} />
      <Skeleton h={38} style={{ marginBottom: 14 }} />
      <Skeleton h={38} style={{ marginBottom: 14 }} />
      <Skeleton h={80} />
    </div>
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="pis-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="pis-list-item">
          <Skeleton w={40} h={40} r={9} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <Skeleton w="40%" h={13} />
            <Skeleton w="70%" h={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ items = 6 }: { items?: number }) {
  return (
    <div className="pis-skel-grid">
      {Array.from({ length: items }).map((_, i) => <Skeleton key={i} h={120} r={12} />)}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   EMPTY STATES — replace the bare "No X yet" text with something that
   actually orients a first-time user and gives them a next action.
   ════════════════════════════════════════════════════════════════════ */
export function EmptyState({ icon, title, body, action }: {
  icon: React.ReactNode; title: string; body?: string; action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="pis-empty-state">
      <div className="pis-empty-state-icon">{icon}</div>
      <h4>{title}</h4>
      {body && <p>{body}</p>}
      {action && <button type="button" className="pis-btn-ghost" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   UNSAVED-CHANGES GUARD
   Each form tab reports its own dirty boolean. We keep a module-level
   set of "who's currently dirty" so the sidebar nav (and the browser
   tab close button) can ask before silently discarding edits.
   ════════════════════════════════════════════════════════════════════ */
const dirtyFlags = new Set<symbol>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (dirtyFlags.size > 0) { e.preventDefault(); e.returnValue = ""; }
  });
}

export function useUnsavedGuard(isDirty: boolean) {
  const idRef = useRef<symbol>(Symbol("dirty"));
  useEffect(() => {
    if (isDirty) dirtyFlags.add(idRef.current);
    else dirtyFlags.delete(idRef.current);
  }, [isDirty]);
  // Clear our own flag if the component unmounts (tab switched away).
  useEffect(() => () => { dirtyFlags.delete(idRef.current); }, []);
}

export function hasUnsavedChanges() { return dirtyFlags.size > 0; }
export function clearUnsavedFlags() { dirtyFlags.clear(); }

/** Wraps a tab-navigation function so it confirms first if anything is dirty. */
export function guardNavigate(navigate: () => void) {
  if (hasUnsavedChanges()) {
    const ok = window.confirm("You have unsaved changes that haven't been saved yet. Leave this page anyway?");
    if (!ok) return;
    clearUnsavedFlags();
  }
  navigate();
}

/* ════════════════════════════════════════════════════════════════════
   COMMAND PALETTE — Cmd/Ctrl+K
   ════════════════════════════════════════════════════════════════════ */
export interface PaletteItem { id: Tab; label: string; group: string; icon: React.ReactNode; }

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({ items, onNavigate, onClose }: {
  items: PaletteItem[]; onNavigate: (t: Tab) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => { setActive(0); }, [query]);

  const choose = useCallback((t: Tab) => { onNavigate(t); onClose(); }, [onNavigate, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); if (filtered[active]) choose(filtered[active].id); }
  };

  return (
    <div className="pis-palette-overlay" onClick={onClose}>
      <div className="pis-palette" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="pis-palette-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            className="pis-palette-input"
            placeholder="Jump to a page…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search dashboard pages"
          />
          <kbd className="pis-palette-kbd">Esc</kbd>
        </div>
        <div className="pis-palette-list" role="listbox">
          {filtered.length === 0 && <div className="pis-palette-empty">No matching page.</div>}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              className={`pis-palette-item${i === active ? " pis-palette-item--active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(item.id)}
              role="option"
              aria-selected={i === active}
            >
              <span className="pis-palette-item-icon">{item.icon}</span>
              <span className="pis-palette-item-label">{item.label}</span>
              <span className="pis-palette-item-group">{item.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteHint() {
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent);
  return (
    <button
      type="button"
      className="pis-topbar-btn pis-palette-hint"
      data-tour="palette-hint"
      onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
      aria-label="Open command palette"
    >
      <Command size={13} /> <kbd>{isMac ? "⌘" : "Ctrl"}</kbd><kbd>K</kbd>
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PREVIEW DRAWER — a slide-over showing roughly how an edit will look
   on the live site before it's published. The content passed in as
   children is a faithful, simplified render of the real public layout
   (matching its type scale / colors), not a literal embed of the public
   bundle — kept separate on purpose to avoid coupling admin edits to
   public-page internals.
   ════════════════════════════════════════════════════════════════════ */
export function PreviewDrawer({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="pis-preview-overlay" onClick={onClose}>
      <div className="pis-preview-drawer" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Preview: ${title}`}>
        <div className="pis-preview-head">
          <div>
            <span className="pis-preview-badge">Preview</span>
            <h3>{title}</h3>
          </div>
          <button className="pis-icon-btn" onClick={onClose} aria-label="Close preview"><X size={16} /></button>
        </div>
        <div className="pis-preview-body">{children}</div>
        <div className="pis-preview-foot">This is a simplified preview of layout and content — exact spacing on the live site may vary slightly by screen size.</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TRASH / RECENTLY DELETED
   ════════════════════════════════════════════════════════════════════ */
interface TrashRow {
  table: string; id: number; kind: string; title: string; sub?: string | null;
  imageUrl?: string | null; deletedAt: string; retentionDays: number;
}

function daysLeft(deletedAt: string, retentionDays: number) {
  const deleted = new Date(deletedAt).getTime();
  const expires = deleted + retentionDays * 86400000;
  const left = Math.ceil((expires - Date.now()) / 86400000);
  return Math.max(0, left);
}

export function TrashTab({ token }: { token: string }) {
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/trash`, { headers: authH(token) });
      if (r.ok) setRows(await r.json());
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const restore = async (row: TrashRow) => {
    const key = `${row.table}-${row.id}`;
    setBusyKey(key);
    const r = await fetch(`${API}/trash/${row.table}/${row.id}/restore`, { method: "POST", headers: authH(token) });
    setBusyKey(null);
    if (r.ok) { flash(`${row.kind} restored`); load(); }
    else flash("Could not restore — try again", false);
  };

  const purge = async (row: TrashRow) => {
    if (!confirm(`Permanently delete this ${row.kind.toLowerCase()}? This cannot be undone.`)) return;
    const key = `${row.table}-${row.id}`;
    setBusyKey(key);
    const r = await fetch(`${API}/trash/${row.table}/${row.id}`, { method: "DELETE", headers: authH(token) });
    setBusyKey(null);
    if (r.ok) { flash("Permanently deleted"); load(); }
    else flash("Could not delete — try again", false);
  };

  return (
    <div className="pis-content">
      <div className="pis-page-header">
        <div>
          <h2>Trash</h2>
          <p>Deleted items stay here for 30 days before being permanently removed — restore anything you didn't mean to delete.</p>
        </div>
        <button className="pis-btn-ghost" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "pis-spin" : ""} /> Refresh
        </button>
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Trash2 size={26} />}
          title="Trash is empty"
          body="Anything you delete from announcements, events, testimonials, gallery, staff, values, divisions, or rules will show up here first."
        />
      ) : (
        <div className="pis-list">
          {rows.map(row => {
            const key = `${row.table}-${row.id}`;
            const left = daysLeft(row.deletedAt, row.retentionDays);
            return (
              <div key={key} className="pis-list-item pis-trash-item">
                {row.imageUrl ? (
                  <img src={row.imageUrl} alt="" className="pis-list-thumb" />
                ) : (
                  <div className="pis-list-icon"><Trash2 size={15} /></div>
                )}
                <div className="pis-list-body">
                  <strong>{row.title || `${row.kind} #${row.id}`}</strong>
                  <p>{row.kind}{row.sub ? ` · ${String(row.sub).slice(0, 60)}` : ""}</p>
                  <span className="pis-trash-expiry">
                    {left === 0 ? "Expires today" : `${left} day${left === 1 ? "" : "s"} left before permanent deletion`}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="pis-btn-sm" disabled={busyKey === key} onClick={() => restore(row)}>
                    <RotateCcw size={13} /> Restore
                  </button>
                  <button className="pis-btn-danger-sm" disabled={busyKey === key} onClick={() => purge(row)}>
                    <Trash2 size={13} /> Delete Forever
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
