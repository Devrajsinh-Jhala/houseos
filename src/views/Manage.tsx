import { useEffect, useRef, useState } from "react";
import { exportBackup, getMeta, importBackup, setMeta } from "../db";
import { DAY_MS, fmtClock, type Item, type Kind } from "../core";
import { disablePush, enablePush, isSubscribed, pushSupport } from "../push";
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
  const [support] = useState(pushSupport);
  // null until the subscription has actually been looked up.
  const [remindersOn, setRemindersOn] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getMeta<string>(BACKUP_KEY).then((v) => setLastBackup(v ?? null));
    void isSubscribed().then(setRemindersOn);
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
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `houseos-${data.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await setMeta(BACKUP_KEY, data.exportedAt);
    setLastBackup(data.exportedAt);
    toast("Backup saved");
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
      {support === "unsupported" ? (
        <p className="note">
          This browser can't do push. On iPhone, open the site in Safari, tap
          Share, then Add to Home Screen, and open it from the icon — push only
          works for installed web apps.
        </p>
      ) : support === "unconfigured" ? (
        <p className="note">
          This copy of HouseOS was deployed without a VAPID key, so reminders are
          off. Everything else works — the readme has the three commands if you
          want to turn them on.
        </p>
      ) : remindersOn === null ? (
        <p className="note">Checking…</p>
      ) : remindersOn ? (
        <>
          <p className="note">
            Reminders are on for this device. Your routine times are re-sent
            automatically whenever you edit one.
          </p>
          <div className="btn-row">
            <button
              className="btn ghost"
              onClick={async () => {
                try {
                  await disablePush();
                  setRemindersOn(await isSubscribed());
                  toast("Reminders off");
                } catch {
                  toast("Could not turn them off");
                }
              }}
            >
              Turn off reminders
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="note">
            Web push has no scheduling on the phone itself, so the server sends
            each reminder at the moment it's due.
          </p>
          <div className="btn-row">
            <button
              className="btn ghost"
              onClick={async () => {
                try {
                  await enablePush();
                  setRemindersOn(await isSubscribed());
                  toast("Reminders on");
                } catch (err) {
                  toast(err instanceof Error ? err.message : "Could not enable");
                }
              }}
            >
              Turn on reminders
            </button>
          </div>
        </>
      )}
    </>
  );
}
