"use client";

import {useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {CHAPTERS, type Block, type Chapter} from "./content";

type Frame = {x: number; y: number; w: number; h: number};

const STORE_KEY = "countercheck.manual.frame";
const MIN_W = 480;
const MIN_H = 360;

/** Eight-tenths of the viewport, centred — the size the manual opens at the first
 * time and returns to on a double-click of its title bar. */
function defaultFrame(): Frame {
  const w = Math.round(window.innerWidth * 0.8);
  const h = Math.round(window.innerHeight * 0.8);
  return {x: Math.round((window.innerWidth - w) / 2), y: Math.round((window.innerHeight - h) / 2), w, h};
}

/** Keeps the panel reachable. A window that has been made narrower since the
 * manual was last dragged must not leave it parked off the edge with no way back. */
function clamp(f: Frame): Frame {
  const w = Math.min(Math.max(f.w, MIN_W), window.innerWidth);
  const h = Math.min(Math.max(f.h, MIN_H), window.innerHeight);
  return {
    w, h,
    x: Math.min(Math.max(f.x, 0), Math.max(0, window.innerWidth - w)),
    y: Math.min(Math.max(f.y, 0), Math.max(0, window.innerHeight - h)),
  };
}

export function HelpBook() {
  const [open, setOpen] = useState(false);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  /* ---- open / close ---------------------------------------------------- */

  const show = useCallback(() => {
    returnFocusTo.current = document.activeElement as HTMLElement;
    setFrame((f) => {
      if (f) return f;
      try {
        const saved = localStorage.getItem(STORE_KEY);
        if (saved) return JSON.parse(saved) as Frame;
      } catch {
        /* a corrupt or blocked localStorage is not a reason to withhold the manual */
      }
      return defaultFrame();
    });
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
    returnFocusTo.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        hide();
        return;
      }
      // "?" from anywhere, unless the person is typing — a note field is the one
      // place in this app where "?" is much more likely to be punctuation.
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "?" && !typing && !open) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, show, hide]);

  useLayoutEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  /**
   * `frame` is what the reader asked for; `shown` is what fits. They are kept
   * apart on purpose. Clamping the stored value would be lossy — narrow the
   * window once and the manual would stay narrow forever, with no way back short
   * of a double-click most people will never discover.
   */
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", bump);
    return () => window.removeEventListener("resize", bump);
  }, [open]);
  const shown = frame ? clamp(frame) : null;

  /** Persisted on settle rather than on every pointer move — writing to
   * localStorage sixty times a second during a drag is pure waste. */
  const settle = useCallback((f: Frame) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(f));
    } catch {
      /* private mode, or a full quota. The manual still works. */
    }
  }, []);

  /* ---- drag and resize -------------------------------------------------- */

  const startGesture = (mode: "move" | "size") => (e: React.PointerEvent) => {
    if (e.button !== 0 || !shown) return;
    // A press on the close button is not a drag on the title bar.
    if ((e.target as HTMLElement).closest("button")) return;
    // Required: without it the browser starts its own selection drag and the
    // pointermove stream never reaches us. It also swallows the compatibility
    // mouse events, which is why the double-click below is detected by hand.
    e.preventDefault();
    // Dragging starts from what is on screen, not from the stored intent.
    const origin = {px: e.clientX, py: e.clientY, ...shown};

    // Listeners go on window rather than on the element with a pointer capture.
    // Capture is the tidier API, but it drops the gesture whenever the capture
    // is lost — a pen leaving proximity, a touch cancelled by a scroll, or a
    // browser that declines to capture a synthetic pointer. Window listeners
    // have none of those failure modes and the pointerId check keeps a second
    // finger out of the drag.
    let latest = shown;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - origin.px;
      const dy = ev.clientY - origin.py;
      latest = clamp(
        mode === "move"
          ? {...origin, x: origin.x + dx, y: origin.y + dy}
          : {...origin, w: origin.w + dx, h: origin.h + dy},
      );
      setFrame(latest);
    };
    const stop = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      settle(latest);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const recentre = useCallback(() => {
    const f = defaultFrame();
    setFrame(f);
    settle(f);
  }, [settle]);

  /* preventDefault on pointerdown is what makes the drag work, and it is also
   * what stops dblclick ever firing. So the double-press is counted here. */
  const lastBarPress = useRef(0);
  const onBarPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const now = performance.now();
    if (now - lastBarPress.current < 400) {
      lastBarPress.current = 0;
      recentre();
      return;
    }
    lastBarPress.current = now;
    startGesture("move")(e);
  };

  /* ---- chapters --------------------------------------------------------- */

  const goTo = (i: number) => {
    setChapterIndex(i);
    proseRef.current?.scrollTo({top: 0});
  };

  const chapter = CHAPTERS[chapterIndex];
  const prev = chapterIndex > 0 ? CHAPTERS[chapterIndex - 1] : null;
  const next = chapterIndex < CHAPTERS.length - 1 ? CHAPTERS[chapterIndex + 1] : null;

  return (
    <>
      <button
        className="help-trigger"
        onClick={() => (open ? hide() : show())}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Open the manual — or press ?"
      >
        <span aria-hidden="true">?</span>
        <span className="cc-sr">Manual</span>
      </button>

      {/* Portalled to <body>. The trigger lives in the masthead, and the masthead
          is a stacking context — a fixed panel rendered inside it paints behind
          <main> however high its z-index goes. */}
      {open && shown && createPortal(
        <div
          ref={panelRef}
          className="manual"
          role="dialog"
          aria-modal="false"
          aria-label="Countercheck manual"
          tabIndex={-1}
          style={{left: shown.x, top: shown.y, width: shown.w, height: shown.h}}
        >
          <div
            className="manual-bar"
            onPointerDown={onBarPointerDown}
            title="Drag to move. Double-click to recentre."
          >
            <p className="manual-title">
              Countercheck
              <span className="manual-title-sub">the manual</span>
            </p>
            <button className="manual-close" onClick={hide} aria-label="Close the manual">
              ✕
            </button>
          </div>

          <div className="manual-body">
            <nav className="manual-contents" aria-label="Chapters">
              <p className="manual-contents-head">Contents</p>
              <ol>
                {CHAPTERS.map((c, i) => (
                  <li key={c.id}>
                    <button
                      className={i === chapterIndex ? "is-current" : undefined}
                      onClick={() => goTo(i)}
                      aria-current={i === chapterIndex ? "true" : undefined}
                    >
                      <span className="manual-num">{String(i + 1).padStart(2, "0")}</span>
                      <span>
                        <span className="manual-ch-title">{c.title}</span>
                        <span className="manual-ch-blurb">{c.blurb}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="manual-prose" ref={proseRef}>
              <article>
                <p className="manual-running-head">
                  Chapter {String(chapterIndex + 1).padStart(2, "0")} of{" "}
                  {String(CHAPTERS.length).padStart(2, "0")}
                </p>
                <h2>{chapter.title}</h2>
                {chapter.blocks.map((b, i) => (
                  <BlockView key={i} block={b} />
                ))}

                <div className="manual-turn">
                  {prev ? (
                    <button onClick={() => goTo(chapterIndex - 1)}>
                      <span className="manual-turn-dir">&larr; Previous</span>
                      <span>{prev.title}</span>
                    </button>
                  ) : (
                    <span />
                  )}
                  {next ? (
                    <button className="manual-turn-next" onClick={() => goTo(chapterIndex + 1)}>
                      <span className="manual-turn-dir">Next &rarr;</span>
                      <span>{next.title}</span>
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              </article>
            </div>
          </div>

          <div
            className="manual-grip"
            onPointerDown={startGesture("size")}
            role="separator"
            aria-label="Resize the manual"
            title="Drag to resize"
          />
        </div>,
        document.body,
      )}
    </>
  );
}

function BlockView({block}: {block: Block}) {
  switch (block.kind) {
    case "p":
      return <p>{block.text}</p>;
    case "h":
      return <h3>{block.text}</h3>;
    case "list":
      return (
        <ul>
          {block.items.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      );
    case "steps":
      return (
        <ol className="manual-steps">
          {block.items.map((t, i) => <li key={i}>{t}</li>)}
        </ol>
      );
    case "note":
      return (
        <aside className="manual-note">
          <p className="manual-note-title">{block.title}</p>
          <p>{block.text}</p>
        </aside>
      );
    case "table":
      return (
        <div className="manual-scroller">
          <table className="manual-table">
            <thead>
              <tr>{block.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) =>
                    j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>,
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "keys":
      return (
        <dl className="manual-keys">
          {block.rows.map(([k, what], i) => (
            <div key={i}>
              <dt><kbd>{k}</kbd></dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      );
  }
}

export type {Chapter};
