import { useEffect, useRef, useState } from "react";
import { exportBackup, getMeta, importBackup, setMeta } from "../db";
import { DAY_MS, type Item, type Kind } from "../core";
import { scheduleLabel, type HouseholdSettings } from "../planner";
import { buildCalendar } from "../calendar";
import { applyTheme, storedTheme, type Theme } from "../theme";
import { registerOffline, useOfflineStatus } from "../offline";

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
  settings: HouseholdSettings;
  isConfigured?: boolean;
  onSettingsChange: (settings: HouseholdSettings) => Promise<void>;
  onReset: () => Promise<void>;
  onEdit: (item: Item) => void;
  onAdd: () => void;
  onReload: () => void | Promise<void>;
  toast: (msg: string) => void;
}

export function Manage({ items, settings, isConfigured=false, onSettingsChange, onReset, onEdit, onAdd, onReload, toast }: Props) {
  const offlineStatus = useOfflineStatus();
  const [kind, setKind] = useState<Kind>("chore");
  const [draftSettings, setDraftSettings] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [confirmReset,setConfirmReset] = useState(false);
  const [resetting,setResetting] = useState(false);
  const [resetError,setResetError] = useState("");
  const [restore, setRestore] = useState<{name: string; data: unknown} | null>(null);
  const [query, setQuery] = useState("");
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getMeta<string>(BACKUP_KEY).then((v) => setLastBackup(v ?? null));
  }, []);
  useEffect(() => setDraftSettings(settings), [settings]);

  const saveSettings = async () => {
    if (!draftSettings.homeName.trim()) return;
    setSaving(true);
    try { await onSettingsChange({...draftSettings, homeName:draftSettings.homeName.trim()}); toast("Your daily rhythm is saved"); }
    catch { toast("Settings couldn't be saved. Please try again."); }
    finally { setSaving(false); }
  };

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
    try {
    const data = await exportBackup();
    download(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      `houseos-${data.exportedAt.slice(0, 10)}.json`
    );
    await setMeta(BACKUP_KEY, data.exportedAt);
    setLastBackup(data.exportedAt);
    toast("Backup saved");
    } catch { toast("Backup couldn't be created. Please try again."); }
  };

  const doCalendar = () => {
    const { ics, count } = buildCalendar(items, new Date(), settings);
    if (!count) {
      toast("No routine or fixed dates to export");
      return;
    }
    download(new Blob([ics], { type: "text/calendar" }), "houseos-routine.ics");
    toast(`${count} events exported`);
  };
  const clearData = async () => {
    if(resetting)return;
    setResetting(true);setResetError("");
    try {await onReset();setConfirmReset(false);}
    catch {setResetError("Your data couldn't be cleared. Nothing has been changed. Please try again.");}
    finally {setResetting(false);}
  };

  const doImport = async (file: File) => {
    try {
      const res = await importBackup(JSON.parse(await file.text()));
      await onReload();
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
      <form className="settings-card" onSubmit={e=>{e.preventDefault();void saveSettings();}}>
        <h2>Your home, your rhythm</h2>
        {!isConfigured&&<p className="setup-status">Not configured yet · The values below are suggestions until you save.</p>}
        <p className="note">Set the shape of your day. Tasks set to “after arriving home” follow these times automatically.</p>
        <div className="settings-grid">
          <div className="field"><label htmlFor="home-name">Home name</label><input id="home-name" required maxLength={60} value={draftSettings.homeName} onChange={e=>setDraftSettings(d=>({...d,homeName:e.target.value}))}/></div>
          <div className="field"><label htmlFor="home-arrival">Weekday arrival time</label><input id="home-arrival" type="time" required value={draftSettings.arrivalTime} onChange={e=>setDraftSettings(d=>({...d,arrivalTime:e.target.value}))}/></div>
          <div className="field"><label htmlFor="weekend-arrival">Weekend home time</label><input id="weekend-arrival" type="time" required value={draftSettings.weekendArrivalTime} onChange={e=>setDraftSettings(d=>({...d,weekendArrivalTime:e.target.value}))}/></div>
          <div className="field"><label htmlFor="home-sleep">Bedtime</label><input id="home-sleep" type="time" required value={draftSettings.sleepTime} onChange={e=>setDraftSettings(d=>({...d,sleepTime:e.target.value}))}/></div>
          <div className="field"><label htmlFor="home-budget">Daily home time (minutes)</label><input id="home-budget" type="number" required min={5} max={600} value={draftSettings.dailyBudgetMinutes} onChange={e=>setDraftSettings(d=>({...d,dailyBudgetMinutes:Number(e.target.value)}))}/></div>
        </div>
        <p className="hint">The planner flags overlapping tasks, chores over your time budget, and tasks that run past bedtime.</p>
        <div className="btn-row"><button className="btn" disabled={saving} type="submit">{saving?"Saving…":"Save my rhythm"}</button></div>
      </form>
      <div className="section"><h2>All tasks & routines</h2><span className="count">{items.length} saved</span></div>
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
              {scheduleLabel(item)}{item.group ? ` · ${item.group}` : ""}{!item.active?" · Paused":""}
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
        <h2>Offline access</h2>
      </div>
      <p className="note" role="status">{offlineStatus==="ready"?"Ready for offline use. Your app files and household records are saved on this device.":offlineStatus==="preparing"?"Preparing your offline files. Keep this page open until setup is complete.":offlineStatus==="development"?"Offline installation is available in the production build. This is the development preview.":"Offline setup is unavailable in this browser right now. Reconnect and try again, or open HouseOS in your phone's browser."}</p>
      {offlineStatus==="unavailable"&&<button className="btn ghost small" onClick={registerOffline}>Retry offline setup</button>}
      <div className="section">
        <h2>Backup</h2>
      </div>
      <p className={backupOverdue ? "note warn" : "note"}>
        {backupAgeDays === null
          ? "Keep a copy of your home data. A backup includes your tasks, completion history, inventory, meals, handbook, and daily rhythm."
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
          if (f) void f.text().then(text=>setRestore({name:f.name,data:JSON.parse(text)})).catch(()=>toast("That file isn't a readable JSON backup."));
          e.target.value = "";
        }}
      />
      {restore && <div className="restore-review" role="alert"><strong>Restore {restore.name}?</strong><p className="note">This replaces your tasks and the household records included in this file. Export a backup first if you want to keep the current version.</p><div className="btn-row"><button className="btn danger" onClick={()=>{const file=new File([JSON.stringify(restore.data)],restore.name);setRestore(null);void doImport(file);}}>Replace with this backup</button><button className="btn ghost" onClick={()=>setRestore(null)}>Cancel</button></div></div>}

      <div className="section">
        <h2>Reminders</h2>
      </div>
      <p className="note">
        Download your schedule to your calendar for reminders, including custom weekdays and tasks timed around your arrival. HouseOS itself does not send notifications while closed.
      </p>
      <div className="btn-row">
        <button className="btn ghost" onClick={doCalendar}>
          Download calendar file
        </button>
      </div>
      <p className="hint">
        Import the file into your calendar. It is a snapshot: re-export after changing arrival times, schedules, or completion dates. Interval chores export their next occurrence. Legacy restock reminders stay in HouseOS. Fixed-date tasks tied to arrival export the next 12 months.
      </p>
      <section className="reset-card" aria-labelledby="reset-title">
        <h2 id="reset-title">Start fresh</h2>
        <p className="note">Clear tasks, schedules, completion history, inventory, shopping, meals, handbook records, and home settings on this device. New homes always start empty.</p>
        {!confirmReset?<button className="btn danger" onClick={()=>setConfirmReset(true)}>Clear all household data</button>:<div className="reset-confirmation" role="alertdialog" aria-modal="false" aria-labelledby="reset-confirm-title">
          <h3 id="reset-confirm-title">Clear everything on this device?</h3>
          <p>This removes all household records and saved preferences. Export a backup first if you want a copy. Other devices are unaffected.</p>
          {resetError&&<p role="alert">{resetError}</p>}
          <div className="btn-row"><button className="btn danger" disabled={resetting} onClick={()=>void clearData()}>{resetting?"Clearing…":"Clear everything and start empty"}</button><button className="btn ghost" disabled={resetting} onClick={()=>setConfirmReset(false)}>Keep my data</button></div>
        </div>}
      </section>
    </>
  );
}
