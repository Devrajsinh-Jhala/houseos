import { useEffect, useRef, useState } from "react";
import { exportBackup, getMeta, importBackup, setMeta } from "../db";
import { DAY_MS, fmtClock, type Item, type Kind } from "../core";
import { buildCalendar } from "../calendar";
import { applyTheme, storedTheme, type Theme } from "../theme";

const KINDS: { key: Kind; label: string }[] = [
  { key: "routine", label: "Routine" },
  { key: "chore", label: "Chores" },
  { key: "restock", label: "Restock" },
  { key: "fixed", label: "Fixed dates" },
];

const THEMES: { key: Theme; label: string }[] = [
  { key: "system", label: "System" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

const BACKUP_KEY = "lastBackupAt";
/** Long enough not to nag, short enough that a wipe costs you weeks not months. */
const NAG_AFTER_DAYS = 30;

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  items: Item[];
  onEdit: (item: Item) => void;
  onAdd: () => void;
  onReload: () => void;
  toast: (msg: string) => void;
}

export function Manage({ items, onEdit, onAdd, onReload, toast }: Props) {
  const [kind, setKind] = useState<Kind>("restock");
  const [query, setQuery] = useState("");
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getMeta<string>(BACKUP_KEY).then((v) => setLastBackup(v ?? null));
  }, []);

  const q = query.trim().toLowerCase();
  const list = items
    .filter((i) => i.kind === kind)
    .filter(
      (i) =>
        !q ||
        i.name.toLowerCase().includes(q) ||
        (i.group ?? "").toLowerCase().includes(q) ||
        (i.note ?? "").toLowerCase().includes(q)
    )
    .sort((a, b) =>
      kind === "routine"
        ? (a.timeAnchor ?? "").localeCompare(b.timeAnchor ?? "")
        : a.name.localeCompare(b.name)
    );

  const backupAgeDays = lastBackup
    ? Math.floor((Date.now() - Date.parse(lastBackup)) / DAY_MS)
    : null;
  const backupOverdue = backupAgeDays === null || backupAgeDays >= NAG_AFTER_DAYS;

  const doExport = async () => {
    const data = await exportBackup();
    download(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      `houseos-${data.exportedAt.slice(0, 10)}.json`
    );
    await setMeta(BACKUP_KEY, data.exportedAt);
    setLastBackup(data.exportedAt);
    toast("Backup saved");
  };

  const doCalendar = () => {
    const { ics, count } = buildCalendar(items);
    if (!count) {
      toast("No routine or fixed dates to export");
      return;
    }
    download(new Blob([ics], { type: "text/calendar" }), "houseos-routine.ics");
    toast(`${count} events exported`);
  };

  const doImport = async (file: File) => {
    try {
      const res = await importBackup(JSON.parse(await file.text()));
      onReload();
      toast(
        res.skipped
          ? `Restored ${res.items} items, skipped ${res.skipped} bad records`
          : `Restored ${res.items} items`
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import failed");
    }
  };

  return (
    <>
      <div className="btn-row">
        <button className="btn" onClick={onAdd}>
          Add an item
        </button>
      </div>

      <div className="shop-toggle">
        {KINDS.map((k) => (
          <button
            key={k.key}
            className="chip"
            aria-pressed={kind === k.key}
            onClick={() => setKind(k.key)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="field search">
        <label className="sr-only" htmlFor="f-search">
          Search items
        </label>
        <input
          id="f-search"
          type="search"
          value={query}
          placeholder="Search by name, group or note"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="section">
        <h2>{KINDS.find((k) => k.key === kind)?.label}</h2>
        <span className="count">{list.length}</span>
      </div>

      {!list.length && (
        <p className="empty">{q ? `Nothing matching "${query}".` : "Nothing here yet."}</p>
      )}

      {list.map((item) => (
        <button key={item.id} className="row" onClick={() => onEdit(item)}>
          <div className="body">
            <div className="name" style={{ opacity: item.active ? 1 : 0.45 }}>
              {item.name}
            </div>
            <div className="meta">
              {item.kind === "routine"
                ? `${fmtClock(item.timeAnchor)} · ${
                    item.dayScope === "any"
                      ? "every day"
                      : item.dayScope === "weekday"
                      ? "weekdays"
                      : "weekends"
                  }`
                : item.kind === "fixed"
                ? `day ${item.monthDay} of the month`
                : `every ${item.intervalDays} days${item.group ? ` · ${item.group}` : ""}`}
            </div>
          </div>
        </button>
      ))}

      <div className="section">
        <h2>Appearance</h2>
      </div>
      <div className="shop-toggle">
        {THEMES.map((t) => (
          <button
            key={t.key}
            className="chip"
            aria-pressed={theme === t.key}
            onClick={() => {
              setTheme(t.key);
              applyTheme(t.key);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="hint">
        System follows your phone, so the app goes dark when it does.
      </p>

      <div className="section">
        <h2>Backup</h2>
      </div>
      <p className={backupOverdue ? "note warn" : "note"}>
        {backupAgeDays === null
          ? "You haven't exported a backup yet. Browser storage is durable but not guaranteed — one file in your cloud drive is the difference between a wipe costing you nothing and costing you six months of dates."
          : backupOverdue
          ? `Last backup was ${backupAgeDays} days ago. Worth doing another.`
          : `Last backup ${backupAgeDays === 0 ? "today" : `${backupAgeDays} days ago`}.`}
      </p>
      <div className="btn-row">
        <button className="btn ghost" onClick={doExport}>
          Export a backup
        </button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>
          Restore from file
        </button>
      </div>
      <input
        ref={fileRef}
        className="hidden-file"
        type="file"
        accept="application/json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doImport(f);
          e.target.value = "";
        }}
      />

      <div className="section">
        <h2>Reminders</h2>
      </div>
      <p className="note">
        HouseOS has no server and no account, so it can't send you a
        notification by itself — there is nowhere for one to be sent from. What
        it can do is hand your routine and fixed dates to the calendar app on
        your phone, which already does alerts properly, offline and for free.
      </p>
      <div className="btn-row">
        <button className="btn ghost" onClick={doCalendar}>
          Download calendar file
        </button>
      </div>
      <p className="hint">
        Open the file on your phone and it offers to add the events. Re-export
        after you change your routine times — the file is a copy, not a link.
        Chores and restocking stay out of it on purpose: their dates move every
        time you tick one off, and a repeating calendar event can't follow that.
      </p>
    </>
  );
}
