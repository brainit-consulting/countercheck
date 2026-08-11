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

/**
 * A stored frame is untrusted input, like any other.
 *
 * It comes back through `JSON.parse`, which will hand you `null`, a string, or
 * an older shape with two of the four numbers missing — and `clamp` turns any
 * of those into NaN, which React drops from the style object without a word.
 * The result was a panel with no size and a trigger reporting
 * aria-expanded="true" over nothing at all.
 */
function isFrame(v: unknown): v is Frame {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return (["x", "y", "w", "h"] as const).every(
    (k) => typeof f[k] === "number" && Number.isFinite(f[k]));
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
  // The key handler is defined above recentre, settle and shown. Refs keep the
  // reading order — open/close, then geometry, then gestures — without a
  // forward declaration or a dependency array that lies.
  const recentreRef = useRef<() => void>(() => {});
  const settleRef = useRef<(f: Frame) => void>(() => {});
  const shownRef = useRef<Frame | null>(null);

  /* ---- open / close ---------------------------------------------------- */

  const show = useCallback(() => {
    returnFocusTo.current = document.activeElement as HTMLElement;
    setFrame((f) => {
      if (f) return f;
      try {
        const saved = localStorage.getItem(STORE_KEY);
        // Parsed is not the same as valid. `JSON.parse` happily returns null,
        // a string, or an older shape with two of the four numbers missing —
        // and `clamp` then produced NaN width and height, which React drops
        // silently, leaving a panel with no size at all and a trigger claiming
        // aria-expanded="true" over nothing on screen. Anything that is not
        // four finite numbers is somebody else's data, not ours.
        const parsed = saved ? JSON.parse(saved) : null;
        if (isFrame(parsed)) return parsed;
        if (saved) localStorage.removeItem(STORE_KEY);
      } catch {
        /* a corrupt or blocked localStorage is not a reason to withhold the manual */
      }
      return defaultFrame();
    });
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
    // Any drag still running belongs to a panel that no longer exists.
    window.dispatchEvent(new Event("countercheck:manual-hidden"));
    returnFocusTo.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (
        el.tagName === "INPUT" || el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" || el.isContentEditable);

      // Escape closes the manual only when the manual is what has focus.
      // It used to fire from anywhere: typing in the sign-in field and pressing
      // Escape to dismiss the browser's autofill closed the manual instead,
      // then pulled focus to the help trigger and took the caret with it.
      // Escape belongs to whatever the reader is currently in.
      if (e.key === "Escape" && open) {
        const inside = !!el && !!panelRef.current?.contains(el);
        if (inside || el === document.body || el === null) {
          hide();
        }
        return;
      }

      // "?" from anywhere, unless the person is typing — a note field is the one
      // place in this app where "?" is much more likely to be punctuation. A
      // <select> counts as typing: the mapping screen renders one per field and
      // its type-ahead swallows the same key.
      //
      // Modifiers are excluded because Ctrl+Shift+/ is a browser and OS
      // shortcut in its own right, and preventDefault on it took the key away
      // from whatever the reader meant it for.
      const modified = e.ctrlKey || e.metaKey || e.altKey;
      if (e.key === "?" && !typing && !modified && !open) {
        e.preventDefault();
        show();
        return;
      }

      /**
       * Move and resize from the keyboard.
       *
       * The Reference chapter listed "drag the title bar" and "drag the
       * bottom-right corner" in a table headed with <kbd> keys, so three of the
       * five things it called keys were pointer-only and the manual could not
       * be moved off whatever it was covering without a mouse. Arrows move it,
       * Shift+arrows resize it, Home recentres — and only while the panel
       * itself has focus, so they never take arrows away from the page.
       */
      if (!open || !el || !panelRef.current?.contains(el)) return;
      if (modified || typing) return;
      const step = e.shiftKey ? 32 : 16;
      const nudge: Record<string, (f: Frame) => Frame> = {
        ArrowLeft: (f) => (e.shiftKey ? {...f, w: f.w - step} : {...f, x: f.x - step}),
        ArrowRight: (f) => (e.shiftKey ? {...f, w: f.w + step} : {...f, x: f.x + step}),
        ArrowUp: (f) => (e.shiftKey ? {...f, h: f.h - step} : {...f, y: f.y - step}),
        ArrowDown: (f) => (e.shiftKey ? {...f, h: f.h + step} : {...f, y: f.y + step}),
      };
      if (e.key === "Home") {
        e.preventDefault();
        recentreRef.current();
        return;
      }
      const move = nudge[e.key];
      if (move && shownRef.current) {
        e.preventDefault();
        const next = clamp(move(shownRef.current));
        setFrame(next);
        settleRef.current(next);
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
  shownRef.current = shown;

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
    // A press is not a gesture. Without this, a bare click on the title bar
    // settled the *clamped* frame over the stored one — so a reader who had
    // sized the manual to 1500 wide on a big screen, then opened it once on a
    // laptop and clicked the bar, lost that size permanently. Intent is only
    // overwritten when the reader actually moved something.
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - origin.px;
      const dy = ev.clientY - origin.py;
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      moved = true;
      latest = clamp(
        mode === "move"
          ? {...origin, x: origin.x + dx, y: origin.y + dy}
          : {...origin, w: origin.w + dx, h: origin.h + dy},
      );
      setFrame(latest);
    };
    const release = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("countercheck:manual-hidden", release);
    };
    const stop = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      release();
      if (moved) settle(latest);
    };
    // Closing the manual mid-drag used to leave this stream running on window:
    // the reader let go somewhere off-screen and the manual reopened at a
    // position it had never been seen in. The gesture ends when its subject
    // does.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("countercheck:manual-hidden", release);
  };

  const recentre = useCallback(() => {
    const f = defaultFrame();
    setFrame(f);
    settle(f);
  }, [settle]);
  recentreRef.current = recentre;
  settleRef.current = settle;

  /* preventDefault on pointerdown is what makes the drag work, and it is also
   * what stops dblclick ever firing. So the double-press is counted here. */
  const lastBarPress = useRef({at: 0, x: 0, y: 0});
  const onBarPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    // The button test has to come first. It used to sit inside startGesture,
    // below the line that stamped the clock — so a right-click followed by a
    // left-click within 400ms counted as a double-press and threw the reader's
    // position away. A right-click is not half of a double-click.
    if (e.button !== 0) return;
    const now = performance.now();
    const {at, x, y} = lastBarPress.current;
    // And a double-press is two presses in the same place. Dragging the manual
    // and pressing again shortly after is one of the most ordinary things a
    // reader does, and it used to recentre the window they had just positioned.
    const nearby = Math.abs(e.clientX - x) < 12 && Math.abs(e.clientY - y) < 12;
    if (now - at < 400 && nearby) {
      lastBarPress.current = {at: 0, x: 0, y: 0};
      recentre();
      return;
    }
    lastBarPress.current = {at: now, x: e.clientX, y: e.clientY};
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
