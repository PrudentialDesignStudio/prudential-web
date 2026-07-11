import React, { useState, useLayoutEffect } from "react";
import { ArrowRight, ArrowLeft, X, Sparkles } from "lucide-react";

export interface TourStep {
  /** CSS selector of the element to spotlight. Omit for a centered, full-dim step. */
  selector?: string;
  title: string;
  body: string;
  /** Called just before this step is measured/shown — e.g. to open the mobile sidebar first. */
  onEnter?: () => void;
}

const CARD_WIDTH = 320;
const CARD_MARGIN = 16;

export function TutorialTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  // Let a step react before it's measured (e.g. open the sidebar on mobile so its
  // target is actually on screen instead of hidden off-canvas).
  useLayoutEffect(() => {
    step.onEnter?.();
  }, [i]);

  useLayoutEffect(() => {
    function measure() {
      if (!step.selector) { setRect(null); return; }
      const el = document.querySelector(step.selector!);
      if (el) {
        setRect(el.getBoundingClientRect());
      } else {
        // If element not found, fallback to centered card
        setRect(null);
      }
    }
    // Give onEnter's DOM changes (e.g. sidebar opening) a moment to apply before measuring.
    measure();
    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    const t = setTimeout(measure, 320);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [i, step.selector]);

  const pad = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isNarrow = vw < 560;
  const cardWidth = isNarrow ? Math.min(CARD_WIDTH, vw - CARD_MARGIN * 2) : CARD_WIDTH;
  const maxCardHeight = vh - CARD_MARGIN * 2;

  const hole = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : { top: vh / 2, left: vw / 2, width: 0, height: 0 };

  let cardStyle: React.CSSProperties;
  if (!rect || isNarrow) {
    // Centered, full-width-ish card — safest layout on small screens and for un-anchored steps.
    cardStyle = {
      top: "50%", left: "50%", transform: "translate(-50%, -50%)",
      width: Math.min(CARD_WIDTH + 20, vw - CARD_MARGIN * 2),
      maxHeight: maxCardHeight, overflowY: "auto",
    };
  } else {
    const left = Math.min(Math.max(hole.left, CARD_MARGIN), vw - cardWidth - CARD_MARGIN);
    const spaceBelow = vh - (hole.top + hole.height) - CARD_MARGIN;
    const spaceAbove = hole.top - CARD_MARGIN;

    if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
      cardStyle = {
        top: hole.top + hole.height + 16, left, width: cardWidth,
        maxHeight: Math.max(160, Math.min(spaceBelow - 16, maxCardHeight)), overflowY: "auto",
      };
    } else {
      cardStyle = {
        top: Math.max(hole.top - 16, CARD_MARGIN), left, width: cardWidth,
        transform: "translateY(-100%)",
        maxHeight: Math.max(160, Math.min(spaceAbove - 16, maxCardHeight)), overflowY: "auto",
      };
    }
  }

  return (
    <div className="pis-tour-root">
      <div className="pis-tour-blocker" onClick={e => e.stopPropagation()} />
      <div
        className="pis-tour-hole"
        style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
      />
      <div className="pis-tour-card" style={cardStyle}>
        <div className="pis-tour-card-top">
          <span className="pis-tour-badge"><Sparkles size={12} /> {i + 1} of {steps.length}</span>
          <button className="pis-tour-x" onClick={onClose} aria-label="Close tour"><X size={15} /></button>
        </div>
        <div className="pis-tour-content" key={i}>
          <h4>{step.title}</h4>
          <p>{step.body}</p>
        </div>
        <div className="pis-tour-dots">
          {steps.map((_, idx) => (
            <span key={idx} className={`pis-tour-dot${idx === i ? " pis-tour-dot--on" : ""}`} />
          ))}
        </div>
        <div className="pis-tour-actions">
          <button className="pis-tour-skip" onClick={onClose}>Skip tour</button>
          <div style={{ display: "flex", gap: 8 }}>
            {i > 0 && (
              <button className="pis-tour-back" onClick={() => setI(i - 1)}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            <button className="pis-tour-next" onClick={() => (last ? onClose() : setI(i + 1))}>
              {last ? "Finish" : "Next"} {!last && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const TOUR_KEY = "pis_tutorial_done_v1";

/** Manages first-visit auto-start + manual replay for the dashboard tour. */
export function useTutorial(enabled: boolean) {
  const [run, setRun] = useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    if (localStorage.getItem(TOUR_KEY)) return;
    const t = setTimeout(() => setRun(true), 900);
    return () => clearTimeout(t);
  }, [enabled]);

  const start = () => setRun(true);
  const finish = () => {
    localStorage.setItem(TOUR_KEY, "1");
    setRun(false);
  };
  return { run, start, finish };
}
