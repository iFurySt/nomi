import { useRef, useState } from "react";
import { Tooltip } from "../components/Tooltip";
import * as Popover from "@radix-ui/react-popover";
import { Search, Shuffle, SmilePlus, Upload } from "lucide-react";
import type { CanvasNote, NoteIcon as IconValue } from "@nomi/core";
import type { CanvasAssetWrite, CanvasRepository } from "@nomi/platform";
import { canvasImageMime, canvasAssetDigest } from "@nomi/platform";
import { newCanvasId } from "@nomi/core";
import { NoteIcon } from "./NoteIcon";
import { emojiGroups } from "./note-emojis";
export type ChangeNoteIcon = (
  id: string,
  icon: IconValue | null,
  upload?: CanvasAssetWrite,
) => void;

export function NoteIconPicker({
  note,
  repository,
  onChange,
  variant = "tree",
}: {
  note: CanvasNote;
  repository: CanvasRepository;
  onChange: ChangeNoteIcon;
  variant?: "tree" | "heading";
}) {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState("emoji"),
    [query, setQuery] = useState("");
  const [category, setCategory] = useState("people"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    search = useRef<HTMLInputElement>(null);
  const adding = variant === "heading" && !note.icon;
  const title = note.title || "未命名文稿";
  const entries = query.trim()
    ? emojiGroups
        .flatMap((g) => g.entries)
        .filter((e) =>
          `${e.label} ${e.value}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        )
    : emojiGroups.find((g) => g.id === category)!.entries;
  function choose(icon: IconValue | null, upload?: CanvasAssetWrite) {
    try {
      onChange(note.id, icon, upload);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function upload(value: File) {
    setBusy(true);
    setError("");
    try {
      if (value.size > 5 * 1024 * 1024) throw Error("图片不能超过 5 MB。");
      const mime = await canvasImageMime(value);
      if (!mime) throw Error("请选择 PNG、JPEG、WebP 或 GIF 图片。");
      const blob = new Blob([value], { type: mime });
      const bitmap = await createImageBitmap(blob).catch(() => {
        throw Error("无法读取这张图片，请选择其他图片。");
      });
      const width = bitmap.width,
        height = bitmap.height;
      bitmap.close();
      const asset = {
        id: newCanvasId("icon"),
        name: value.name,
        mime,
        bytes: blob.size,
        sha256: await canvasAssetDigest(blob),
        width,
        height,
      };
      choose({ type: "image", asset: asset.id }, { asset, blob });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Popover.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          setError("");
          setQuery("");
          setTab("emoji");
        }
      }}
    >
      <Tooltip label="Change icon" disabled={open || adding}>
        <Popover.Trigger asChild>
          <button
            className={
              variant === "tree"
                ? "notes-icon-button"
                : adding
                  ? "writing-add-icon"
                  : "writing-heading-icon"
            }
            aria-label={`${adding ? "添加" : "更改"}${title}的图标`}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
          >
            {adding ? (
              <>
                <SmilePlus size={15} />
                <span>Add Icon</span>
              </>
            ) : (
              <NoteIcon note={note} repository={repository} />
            )}
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          className="note-icon-picker"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-label="更改文稿图标"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            search.current?.focus();
          }}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <header>
            <div role="tablist" aria-label="图标来源">
              {[
                ["emoji", "Emoji"],
                ["upload", "Upload"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  id={`icon-${note.id}-${id}`}
                  tabIndex={tab === id ? 0 : -1}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      ) ||
                      busy
                    )
                      return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? "emoji"
                        : event.key === "End"
                          ? "upload"
                          : tab === "emoji"
                            ? "upload"
                            : "emoji";
                    setTab(next);
                    setError("");
                    document.getElementById(`icon-${note.id}-${next}`)?.focus();
                  }}
                  aria-selected={tab === id}
                  aria-controls={`icon-${note.id}-panel`}
                  disabled={busy}
                  onClick={() => {
                    setTab(id);
                    setError("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="note-icon-remove"
              disabled={!note.icon || busy}
              onClick={() => choose(null)}
            >
              Remove
            </button>
          </header>
          <div
            role="tabpanel"
            id={`icon-${note.id}-panel`}
            aria-labelledby={`icon-${note.id}-${tab}`}
          >
            {tab === "emoji" ? (
              <>
                <div className="note-emoji-search">
                  <label>
                    <Search size={16} />
                    <input
                      ref={search}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Filter…"
                      aria-label="搜索 Emoji"
                      onKeyDown={(event) => {
                        if (
                          event.key === "ArrowDown" &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          event.currentTarget
                            .closest(".note-icon-picker")
                            ?.querySelector<HTMLButtonElement>(
                              ".note-emoji-grid button",
                            )
                            ?.focus();
                        }
                      }}
                    />
                  </label>
                  <button
                    aria-label="随机 Emoji"
                    title="随机 Emoji"
                    onClick={() => {
                      const all = emojiGroups.flatMap((g) => g.entries);
                      choose({
                        type: "emoji",
                        value:
                          all[Math.floor(Math.random() * all.length)].value,
                      });
                    }}
                  >
                    <Shuffle size={16} />
                  </button>
                </div>
                <div className="note-emoji-results" key={category + query}>
                  <small>
                    {query
                      ? "搜索结果"
                      : emojiGroups
                          .find((g) => g.id === category)!
                          .name.split(" ")[0]}
                  </small>
                  <div
                    className="note-emoji-grid"
                    onKeyDown={(event) => {
                      const buttons = [
                        ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                          "button",
                        ),
                      ];
                      const index = buttons.indexOf(
                        event.target as HTMLButtonElement,
                      );
                      const delta = {
                        ArrowLeft: -1,
                        ArrowRight: 1,
                        ArrowUp: -9,
                        ArrowDown: 9,
                      }[event.key];
                      if (
                        index < 0 ||
                        (delta === undefined &&
                          event.key !== "Home" &&
                          event.key !== "End")
                      )
                        return;
                      event.preventDefault();
                      buttons[
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? buttons.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  buttons.length - 1,
                                  index + (delta ?? 0),
                                ),
                              )
                      ]?.focus();
                    }}
                  >
                    {entries.map((e, index) => (
                      <button
                        key={e.value}
                        tabIndex={index === 0 ? 0 : -1}
                        title={e.label}
                        aria-label={`${e.value} ${e.label}`}
                        aria-pressed={
                          note.icon?.type === "emoji" &&
                          note.icon.value === e.value
                        }
                        onClick={() =>
                          choose({ type: "emoji", value: e.value })
                        }
                      >
                        {e.value}
                      </button>
                    ))}
                  </div>
                  {!entries.length && (
                    <p className="note-emoji-empty">
                      没有找到 Emoji，试试中文或英文关键词。
                    </p>
                  )}
                </div>
                <footer aria-label="Emoji 分类">
                  {emojiGroups.map((g) => (
                    <button
                      key={g.id}
                      aria-label={g.name}
                      title={g.name}
                      aria-pressed={category === g.id && !query}
                      onClick={() => {
                        setQuery("");
                        setCategory(g.id);
                      }}
                    >
                      {g.icon}
                    </button>
                  ))}
                </footer>
              </>
            ) : (
              <div className="note-icon-upload">
                <Upload size={26} />
                <button disabled={busy} onClick={() => file.current?.click()}>
                  {busy ? "正在读取…" : "上传图片"}
                </button>
                <p>PNG、JPEG、WebP、GIF · 最大 5 MB</p>
                <input
                  ref={file}
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    e.target.value = "";
                    if (selected) void upload(selected);
                  }}
                />
              </div>
            )}
          </div>
          {error && (
            <p className="note-icon-error" role="alert">
              {error}
            </p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
