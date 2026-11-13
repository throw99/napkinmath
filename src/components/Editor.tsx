import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { evaluateLines } from "../lib/engine";
import { formatResult } from "../lib/formatter";
import { highlightText } from "../lib/highlight";
import { track } from "../lib/analytics";
import { duplicateLine, MOD_LABEL, toggleComment } from "../lib/shortcuts";

// An editing burst ends after this much idle time; one calculation_evaluated event per burst.
const EDIT_BURST_IDLE_MS = 2000;

type Props = {
  text: string;
  setText: (t: string) => void;
};

let measureCtx: CanvasRenderingContext2D | null = null;

// WebKit (Safari, the Tauri app on Linux) draws a textarea caret from the previous line's text bottom to this
// line's text bottom, so with our tall lines it is a full line tall and sits above the line. There the native
// caret is hidden and a text-height caret is drawn instead.
const DRAW_CARET =
  typeof navigator !== "undefined" &&
  /AppleWebKit/.test(navigator.userAgent) &&
  !/Chrome|Chromium|Edg/.test(navigator.userAgent);

// Width of the text before the caret on its line, as the textarea lays it out.
function caretOffsetX(ta: HTMLTextAreaElement, pos: number) {
  const lineStart = ta.value.lastIndexOf("\n", pos - 1) + 1;
  const cs = getComputedStyle(ta);
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  measureCtx.font = `${cs.fontSize} ${cs.fontFamily}`;
  // Canvas draws a tab as one space; expand tabs to the textarea's tab stops first.
  const tabSize = parseInt(cs.tabSize) || 8;
  let prefix = "";
  for (const ch of ta.value.slice(lineStart, pos)) prefix += ch === "\t" ? " ".repeat(tabSize - (prefix.length % tabSize)) : ch;
  return measureCtx.measureText(prefix).width;
}

// Typing scrolls a textarea only until the caret reaches its left edge (LibreWolf 146 not even past the padding),
// so text typed at a line start while scrolled right can stay hidden. When the caret sits in or past the left
// padding, scroll back to the line start if the caret then fits, otherwise far enough to show it with the padding.
function keepCaretInView(ta: HTMLTextAreaElement, paddingPx: number) {
  if (ta.scrollLeft === 0) return;
  const caretX = paddingPx + caretOffsetX(ta, ta.selectionEnd);
  if (caretX - ta.scrollLeft > paddingPx + 1) return;
  ta.scrollLeft = caretX + paddingPx <= ta.clientWidth ? 0 : caretX - paddingPx;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getActiveLineIndex(text: string, selectionStart: number) {
  const idx = clamp(selectionStart, 0, text.length);
  let line = 0;
  for (let i = 0; i < idx; i++) if (text[i] === "\n") line++;
  return line;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function Editor({ text, setText }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const resultsScrollRef = useRef<HTMLPreElement | null>(null);
  const gutterScrollRef = useRef<HTMLPreElement | null>(null);
  const activeHighlightRef = useRef<HTMLDivElement | null>(null);
  const caretRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef({ top: 0, left: 0, rafId: 0 });
  const pendingScrollRef = useRef<{ top: number; left: number } | null>(null);

  const [activeLine, setActiveLine] = useState(0);
  const [debouncedText, setDebouncedText] = useState(text);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedText(text), 50);
    return () => window.clearTimeout(t);
  }, [text]);

  const liveLines = useMemo(() => text.split("\n"), [text]);
  const debouncedLines = useMemo(() => debouncedText.split("\n"), [debouncedText]);
  const { lineEvals, definedVars } = useMemo(
    () => evaluateLines(debouncedLines),
    [debouncedLines],
  );

  // Counted when the user's own edit is evaluated, so switching sheets mid-burst doesn't change the count.
  const editedTextRef = useRef<string | null>(null);
  const burstTimerRef = useRef(0);
  useEffect(() => {
    if (editedTextRef.current !== debouncedText) return;
    editedTextRef.current = null;
    const linesWithResults = lineEvals.filter((le) => le.kind === "expr" && !le.error).length;
    window.clearTimeout(burstTimerRef.current);
    burstTimerRef.current = window.setTimeout(() => {
      if (linesWithResults) track({ name: "calculation_evaluated", properties: { lines_with_results: linesWithResults } });
    }, EDIT_BURST_IDLE_MS);
  }, [lineEvals]);

  const results = useMemo(() => {
    const evaluated = lineEvals.map((le) => {
      if (le.kind !== "expr") return null;
      return formatResult(le.value, { currencyCode: le.currencyCode });
    });
    if (evaluated.length === liveLines.length) return evaluated;
    if (evaluated.length < liveLines.length) {
      return [...evaluated, ...Array.from({ length: liveLines.length - evaluated.length }, () => null)];
    }
    return evaluated.slice(0, liveLines.length);
  }, [lineEvals, liveLines.length]);

  // The results shown last time. A line change rebuilds the column, so only values that changed get the
  // fade-in; otherwise every total would fade in again each time the caret moves to another line.
  const shownResultsRef = useRef<(string | null)[]>([]);
  useEffect(() => {
    shownResultsRef.current = results;
  }, [results]);

  const resultsHtml = useMemo(() => {
    const lines: string[] = [];
    for (let i = 0; i < liveLines.length; i++) {
      const value = results[i] ?? "";
      const isActive = i === activeLine;
      const color = isActive ? "var(--nm-result-active)" : "var(--nm-result-text)";
      const weight = isActive ? "500" : "400";
      const fresh = value && value !== shownResultsRef.current[i];
      lines.push(
        `<span style="color:${color};font-weight:${weight}" class="${fresh ? "nm-result-value" : ""}">${value ? escapeHtml(value) : "&nbsp;"}</span>`,
      );
    }
    return lines.join("\n");
  }, [results, liveLines.length, activeLine]);

  const highlighted = useMemo(() => {
    return highlightText(text, definedVars, lineEvals);
  }, [text, definedVars, lineEvals]);

  const rowCount = Math.max(12, liveLines.length + 4);
  const lineHeightPx = 36;
  const paddingTopPx = 16;
  const gutterWidthPx = 48;
  const leftPaddingPx = paddingTopPx + gutterWidthPx;

  const gutterHtml = useMemo(() => {
    const lines: string[] = [];
    for (let i = 0; i < liveLines.length; i++) {
      const isActive = i === activeLine;
      const color = isActive ? "var(--nm-gutter-active)" : "var(--nm-gutter-text)";
      const weight = isActive ? "500" : "400";
      lines.push(`<span style="color:${color};font-weight:${weight}">${i + 1}</span>`);
    }
    return lines.join("\n");
  }, [liveLines.length, activeLine]);

  function updateActiveHighlight() {
    const el = activeHighlightRef.current;
    if (!el) return;
    el.style.transform = `translateY(${
      paddingTopPx + activeLine * lineHeightPx - scrollRef.current.top
    }px)`;
  }

  // The drawn caret (WebKit only): text height, centred in the caret's line, restarted solid on every move.
  function updateCaret() {
    const el = caretRef.current;
    const ta = textareaRef.current;
    if (!el || !ta) return;
    if (document.activeElement !== ta || ta.selectionStart !== ta.selectionEnd) {
      el.style.display = "none";
      return;
    }
    const pos = ta.selectionStart;
    const height = Math.round(parseFloat(getComputedStyle(ta).fontSize) * 1.3);
    const x = gutterWidthPx + paddingTopPx + caretOffsetX(ta, pos) - ta.scrollLeft;
    const y = paddingTopPx + getActiveLineIndex(ta.value, pos) * lineHeightPx + (lineHeightPx - height) / 2 - ta.scrollTop;
    el.style.display = x < gutterWidthPx ? "none" : "block";
    el.style.height = `${height}px`;
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  }

  function applyScroll(top: number, left: number) {
    const pre = highlightRef.current;
    if (pre) {
      pre.scrollTop = top;
      pre.scrollLeft = left;
    }
    if (resultsScrollRef.current) {
      resultsScrollRef.current.scrollTop = top;
    }
    if (gutterScrollRef.current) {
      gutterScrollRef.current.scrollTop = top;
    }
    scrollRef.current.top = top;
    scrollRef.current.left = left;
    updateActiveHighlight();
    updateCaret();
  }

  function syncScroll() {
    const ta = textareaRef.current;
    if (!ta) return;
    pendingScrollRef.current = { top: ta.scrollTop, left: ta.scrollLeft };
    if (scrollRef.current.rafId) return;
    scrollRef.current.rafId = window.requestAnimationFrame(() => {
      scrollRef.current.rafId = 0;
      const pending = pendingScrollRef.current;
      if (!pending) return;
      applyScroll(pending.top, pending.left);
    });
  }

  function setCursor(pos: number) {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.selectionStart = pos;
    ta.selectionEnd = pos;
    ta.focus();
    setActiveLine(getActiveLineIndex(ta.value, pos));
  }

  // Caret position for a shortcut's edit, applied in the same commit as the new text so a fast next keystroke
  // can't land at the end of the textarea, where the browser puts the caret when a controlled value changes.
  const pendingCaretRef = useRef<number | null>(null);

  function setTextAndCaret(nextText: string, pos: number) {
    if (nextText === text) {
      setCursor(pos);
      return;
    }
    pendingCaretRef.current = pos;
    setText(nextText);
  }

  useLayoutEffect(() => {
    if (pendingCaretRef.current === null) return;
    setCursor(pendingCaretRef.current);
    pendingCaretRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => {
    syncScroll();
    updateActiveHighlight();
    return () => {
      if (scrollRef.current.rafId) {
        window.cancelAnimationFrame(scrollRef.current.rafId);
        scrollRef.current.rafId = 0;
      }
    };
  }, []);

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    applyScroll(ta.scrollTop, ta.scrollLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, activeLine, liveLines.length]);

  useEffect(() => {
    updateActiveHighlight();
  }, [activeLine]);

  // Sheets save on every change, so Ctrl+S / ⌘S has nothing to do; stop the browser's "Save page" dialog anywhere on the page.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className="nm-grid-bg flex h-full flex-col overflow-hidden rounded-xl"
      style={{
        background: "var(--nm-bg-card)",
        border: "1px solid var(--nm-border)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.03)",
      }}
    >
      <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] gap-0 sm:grid-cols-[1fr_180px]">
        {/* Editor pane */}
        <div
          className="relative overflow-hidden"
          onWheel={(e) => {
            // Nothing scrollable sits under the line numbers, so pass wheel scrolling there on to the editor.
            if (e.target !== e.currentTarget) return;
            const ta = textareaRef.current;
            if (!ta) return;
            const unit = e.deltaMode === 1 ? lineHeightPx : e.deltaMode === 2 ? ta.clientHeight : 1;
            ta.scrollBy(e.deltaX * unit, e.deltaY * unit);
          }}
        >
          {/* Line numbers gutter */}
          <pre
            ref={gutterScrollRef}
            aria-hidden="true"
            data-testid="gutter"
            className="nm-ios-nozoom nm-scrollbar-x-ghost pointer-events-none absolute inset-y-0 left-0 z-20 w-12 overflow-x-scroll overflow-y-hidden px-2 py-4 font-mono text-[13px] leading-9 text-right tabular-nums"
            style={{ background: "var(--nm-bg-gutter)", borderRight: "1px solid var(--nm-border-subtle)" }}
            dangerouslySetInnerHTML={{ __html: gutterHtml }}
          />

          {/* Syntax highlighting overlay */}
          <pre
            ref={highlightRef}
            aria-hidden="true"
            data-testid="highlight"
            className="nm-ios-nozoom nm-editor nm-scrollbar-x-ghost pointer-events-none absolute inset-y-0 right-0 z-10 m-0 overflow-x-scroll overflow-y-auto p-4 font-mono text-[13px] leading-9"
            style={{ left: gutterWidthPx, color: "var(--nm-text)" }}
          >
            <code
              className="block whitespace-pre"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          </pre>

          {/* Actual textarea (caret layer) */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              editedTextRef.current = e.target.value;
              setText(e.target.value);
              keepCaretInView(e.currentTarget, paddingTopPx);
            }}
            onScroll={syncScroll}
            onSelect={(e) => {
              const ta = e.currentTarget;
              setActiveLine(getActiveLineIndex(ta.value, ta.selectionStart ?? 0));
              updateCaret();
            }}
            onFocus={updateCaret}
            onBlur={updateCaret}
            onKeyDown={(e) => {
              const ta = e.currentTarget;
              const pos = ta.selectionStart ?? 0;
              setActiveLine(getActiveLineIndex(ta.value, pos));

              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
                e.preventDefault();
                const edit = duplicateLine(text, pos);
                setTextAndCaret(edit.text, edit.caret);
                return;
              }

              if ((e.ctrlKey || e.metaKey) && e.key === "/") {
                e.preventDefault();
                const edit = toggleComment(text, pos);
                setTextAndCaret(edit.text, edit.caret);
                return;
              }
            }}
            rows={rowCount}
            spellCheck={false}
            wrap="off"
            className="nm-ios-nozoom nm-editor nm-scrollbar-x absolute inset-y-0 z-20 m-0 block h-full resize-none border-0 bg-transparent p-4 font-mono text-[13px] leading-9 text-transparent outline-none whitespace-pre overflow-x-scroll overflow-y-auto"
            style={{
              // Start right of the gutter (not under it) so the browser keeps the caret out of the line numbers,
              // and scroll fully back to column 0 rather than stopping with the caret at the gutter edge.
              left: gutterWidthPx,
              width: `calc(100% - ${gutterWidthPx}px)`,
              scrollPaddingLeft: paddingTopPx,
              caretColor: DRAW_CARET ? "transparent" : "var(--nm-caret)",
              WebkitTextFillColor: "transparent",
            }}
          />

          {DRAW_CARET && (
            <div
              ref={caretRef}
              aria-hidden="true"
              className="nm-drawn-caret pointer-events-none absolute left-0 top-0 z-30 w-px"
              style={{ display: "none", background: "var(--nm-caret)" }}
            />
          )}

          {/* Active line highlight */}
          <div className="pointer-events-none absolute inset-0 z-0">
            <div
              ref={activeHighlightRef}
              className="nm-active-line absolute"
              style={{
                left: leftPaddingPx,
                right: paddingTopPx,
                height: lineHeightPx,
              }}
            />
          </div>
        </div>

        {/* Results column */}
        <div className="nm-result-divider overflow-hidden" style={{ background: "var(--nm-bg-results)" }}>
          <pre
            ref={resultsScrollRef}
            aria-hidden="true"
            data-testid="results"
            className="nm-ios-nozoom nm-scrollbar-x h-full overflow-x-scroll overflow-y-auto p-4 font-mono text-[13px] leading-9 tabular-nums"
            style={{ textAlign: "right" }}
            onScroll={(e) => {
              // Wheel scrolling over the results drives the editor so rows stay aligned.
              const ta = textareaRef.current;
              const res = e.currentTarget;
              if (!ta || ta.scrollTop === res.scrollTop) return;
              ta.scrollTop = res.scrollTop;
              // The results column can scroll a few px further than the editor; pull it back to match.
              if (ta.scrollTop !== res.scrollTop) res.scrollTop = ta.scrollTop;
            }}
            dangerouslySetInnerHTML={{ __html: resultsHtml }}
          />
        </div>
      </div>

      {/* Footer status bar */}
      <div
        className="flex items-center justify-between px-4 py-2 font-sans text-[11px] tracking-wide"
        style={{
          background: "var(--nm-footer-bg)",
          borderTop: "1px solid var(--nm-border-subtle)",
          color: "var(--nm-text-faint)",
        }}
      >
        <div className="hidden sm:flex sm:items-center sm:gap-3">
          <span>{MOD_LABEL}D duplicate line</span>
          <span style={{ color: "var(--nm-border)" }}>|</span>
          <span>{MOD_LABEL}/ comment line</span>
          <span style={{ color: "var(--nm-border)" }}>|</span>
          <span>Saves automatically</span>
        </div>
        <div className="sm:hidden">Start a line with # for a note</div>
        <div className="tabular-nums">{liveLines.length} lines</div>
      </div>
    </div>
  );
}
