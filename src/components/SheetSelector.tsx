import { lazy, Suspense, useEffect, useRef, useState } from "react";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

export type Sheet = {
  id: string;
  name: string;
  emoji: string;
  content: string;
  updatedAt: number;
};

type Props = {
  sheets: Sheet[];
  activeSheetId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onEmoji: (id: string, emoji: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
};

function formatTimestamp(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default function SheetSelector(props: Props) {
  const {
    sheets,
    activeSheetId,
    onSelect,
    onNew,
    onRename,
    onDelete,
    onEmoji,
    collapsed,
    setCollapsed,
    mobileOpen,
    setMobileOpen,
  } = props;

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<{ type: "emoji" | "delete"; id: string } | null>(null);
  const menuRowRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const longPressRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  // Active sheet is indicated in the list via the accent highlight.

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !dialog) {
        setMenu(null);
        setMobileOpen(false);
        setRenamingId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setMobileOpen, dialog]);

  useEffect(() => {
    if (dialog) dialogRef.current?.showModal();
  }, [dialog]);

  function openMenu(id: string, x: number, y: number, row: HTMLElement | null) {
    menuRowRef.current = row;
    setMenu({ id, x, y });
    setRenamingId(null);
  }

  const Sidebar = (
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--nm-bg-gutter)", borderRight: "1px solid var(--nm-border-subtle)" }}
      onClick={() => setMenu(null)}
    >
      <div className={collapsed ? "p-2" : "flex items-center justify-between px-3 py-2"}>
        {!collapsed ? (
          <>
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-wide" style={{ color: "var(--nm-text-muted)" }}>
                My Sheets
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* mobile toggle */}
              <button
                type="button"
                className="nm-btn inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm sm:hidden"
                style={{ borderColor: "var(--nm-border)", color: "var(--nm-text-muted)" }}
                onClick={() => setMobileOpen(false)}
                aria-label="Close sheets"
              >
                ✕
              </button>

              <button
                type="button"
                className="nm-btn hidden h-8 w-8 items-center justify-center rounded-md border text-sm sm:inline-flex"
                style={{ borderColor: "var(--nm-border)", color: "var(--nm-text-muted)" }}
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? "Expand sheets" : "Collapse sheets"}
              >
                {collapsed ? "☰" : "⟨"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex w-full items-center">
              {/* mobile toggle */}
              <button
                type="button"
                className="nm-btn inline-flex h-9 w-full items-center justify-center rounded-lg border text-sm sm:hidden"
                style={{ borderColor: "var(--nm-border)", color: "var(--nm-text-muted)" }}
                onClick={() => setMobileOpen(false)}
                aria-label="Close sheets"
              >
                ✕
              </button>

              <button
                type="button"
                className="nm-btn hidden h-9 w-full items-center justify-center rounded-lg border text-sm sm:inline-flex"
                style={{ borderColor: "var(--nm-border)", color: "var(--nm-text-muted)" }}
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? "Expand sheets" : "Collapse sheets"}
              >
                {collapsed ? "☰" : "⟨"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className={"min-h-0 flex-1 overflow-auto " + (collapsed ? "px-2" : "px-2") + " py-1"}>
        {sheets.map((s) => {
          const isActive = s.id === activeSheetId;
          const isRenaming = renamingId === s.id;
          return (
            <div
              key={s.id}
              tabIndex={-1}
              className={
                "group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nm-accent)]" +
                (isActive ? "" : " hover:bg-black/5")
              }
              style={{
                background: isActive ? "var(--nm-accent)" : "transparent",
                color: isActive ? "#fff" : "var(--nm-text)",
              }}
              onClick={() => {
                if (longPressFiredRef.current) {
                  longPressFiredRef.current = false;
                  return;
                }
                onSelect(s.id);
                setMobileOpen(false);
              }}
              onDoubleClick={() => {
                if (collapsed) return;
                setRenamingId(s.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(s.id, e.clientX, e.clientY, e.currentTarget);
              }}
              onPointerDown={(e) => {
                if (e.pointerType !== "touch") return;
                longPressFiredRef.current = false;
                if (longPressRef.current) window.clearTimeout(longPressRef.current);
                const row = e.currentTarget;
                longPressRef.current = window.setTimeout(() => {
                  longPressFiredRef.current = true;
                  openMenu(s.id, e.clientX, e.clientY, row);
                }, 520);
              }}
              onPointerUp={() => {
                if (longPressRef.current) window.clearTimeout(longPressRef.current);
                longPressRef.current = null;
              }}
              onPointerCancel={() => {
                if (longPressRef.current) window.clearTimeout(longPressRef.current);
                longPressRef.current = null;
              }}
            >
              <div className="w-6 text-center text-base">{s.emoji || "📄"}</div>

              {!collapsed && (
                <div className="min-w-0 flex-1">
                  {isRenaming ? (
                    <input
                      autoFocus
                      defaultValue={s.name}
                      className="nm-ios-nozoom w-full rounded-md border bg-transparent px-2 py-1 text-sm outline-none"
                      style={{ borderColor: isActive ? "rgba(255,255,255,0.45)" : "var(--nm-border)" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.currentTarget as HTMLInputElement).blur();
                        }
                        if (e.key === "Escape") {
                          setRenamingId(null);
                        }
                      }}
                      onBlur={(e) => {
                        const next = e.currentTarget.value.trim() || "Untitled";
                        onRename(s.id, next);
                        setRenamingId(null);
                      }}
                    />
                  ) : (
                    <div className="truncate text-sm font-medium">{s.name}</div>
                  )}
                  <div
                    className="text-xs"
                    style={{ color: isActive ? "rgba(255,255,255,0.75)" : "var(--nm-text-faint)" }}
                  >
                    {formatTimestamp(s.updatedAt)}
                  </div>
                </div>
              )}

              {!collapsed && (
                <button
                  type="button"
                  className="nm-btn hidden h-7 w-7 items-center justify-center rounded-md border text-xs group-hover:inline-flex group-focus-within:inline-flex"
                  style={{
                    borderColor: isActive ? "rgba(255,255,255,0.35)" : "var(--nm-border)",
                    color: isActive ? "#fff" : "var(--nm-text-muted)",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openMenu(s.id, e.clientX, e.clientY, e.currentTarget.closest(".group"));
                  }}
                  aria-label="Sheet actions"
                >
                  ⋯
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-2">
        <button
          type="button"
          onClick={() => {
            onNew();
            setMobileOpen(false);
          }}
          className="nm-btn inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium"
          style={{ borderColor: "var(--nm-border)", color: "var(--nm-text)" }}
        >
          <span>＋</span>
          {!collapsed && <span>New</span>}
        </button>
      </div>

      {menu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <div
            className="absolute min-w-44 rounded-lg border p-1 shadow-lg"
            style={{
              left: Math.max(8, menu.x - 8),
              top: Math.max(8, menu.y - 8),
              background: "var(--nm-bg-card)",
              borderColor: "var(--nm-border)",
              color: "var(--nm-text)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="nm-btn flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5"
              onClick={() => {
                setMenu(null);
                setRenamingId(menu.id);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className="nm-btn flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5"
              onClick={() => {
                setMenu(null);
                setDialog({ type: "emoji", id: menu.id });
              }}
            >
              Emoji
            </button>
            <button
              type="button"
              className="nm-btn flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5"
              style={{ color: "var(--nm-syn-error)" }}
              onClick={() => {
                setDialog({ type: "delete", id: menu.id });
                setMenu(null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Desktop sidebar is inline; mobile uses drawer overlay
  return (
    <>
      <div className={"hidden h-full sm:block " + (collapsed ? "w-14" : "w-[220px]")}>{Sidebar}</div>

      {dialog && (
        <dialog
          ref={dialogRef}
          onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}
          onClose={() => {
            if (dialog.type === "emoji") {
              requestAnimationFrame(() => menuRowRef.current?.focus());
            }
            setDialog(null);
          }}
          aria-labelledby="sheet-dialog-title"
          className={(dialog.type === "emoji" ? "w-[min(92vw,30rem)]" : "w-[min(90vw,24rem)]") + " max-h-[calc(100dvh-1rem)] rounded-xl border p-5 shadow-xl backdrop:bg-black/50"}
          style={{ background: "var(--nm-bg-card)", borderColor: "var(--nm-border)", color: "var(--nm-text)" }}
        >
          <form onSubmit={(e) => {
            e.preventDefault();
            if (dialog.type === "delete") {
              onDelete(dialog.id);
              dialogRef.current?.close();
            }
          }}>
            <h2 id="sheet-dialog-title" className="text-base font-semibold">
              {dialog.type === "emoji" ? "Change emoji" : "Delete sheet?"}
            </h2>
            {dialog.type === "emoji" ? (
              <div className="mt-4">
                <Suspense fallback={<p role="status">Loading emoji…</p>}>
                  <EmojiPicker
                    width="100%"
                    height="min(440px, 60vh)"
                    emojiStyle="native"
                    autoFocusSearch
                    previewConfig={{ showPreview: false }}
                    onEmojiClick={(selected) => {
                      onEmoji(dialog.id, selected.emoji);
                      dialogRef.current?.close();
                    }}
                    style={{
                      "--epr-bg-color": "var(--nm-bg-card)",
                      "--epr-text-color": "var(--nm-text)",
                      "--epr-picker-border-color": "var(--nm-border)",
                      "--epr-search-input-bg-color": "var(--nm-bg)",
                      "--epr-search-input-bg-color-active": "var(--nm-bg)",
                      "--epr-category-label-bg-color": "var(--nm-bg-card)",
                      "--epr-hover-bg-color": "var(--nm-bg-active)",
                      "--epr-focus-bg-color": "var(--nm-bg-active)",
                      "--epr-highlight-color": "var(--nm-accent)",
                      "--epr-category-icon-active-color": "var(--nm-accent)",
                      "--epr-category-icon-inactive-color": "var(--nm-text-muted)",
                    } as React.CSSProperties}
                  />
                </Suspense>
              </div>
            ) : (
              <p className="mt-3 text-sm" style={{ color: "var(--nm-text-muted)" }}>
                Delete “{sheets.find((s) => s.id === dialog.id)?.name ?? "sheet"}”?
                {sheets.find((s) => s.id === dialog.id)?.content.trim() && " This sheet has content."}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" autoFocus={dialog.type === "delete"} onClick={() => dialogRef.current?.close()}
                className="nm-btn rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--nm-border)" }}>Cancel</button>
              {dialog.type === "delete" && <button type="submit" className="nm-btn rounded-md px-3 py-2 text-sm font-medium"
                style={{ background: "var(--nm-syn-error)", color: "#fff" }}>Delete</button>}
            </div>
          </form>
        </dialog>
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.35)" }}
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[260px] shadow-xl">{Sidebar}</div>
        </div>
      )}

    </>
  );
}
