import { useEffect, useRef, useState } from "react";
import { uid } from "../core";
import { CONTACT_CATEGORIES, phoneLink, type HomeContact } from "../homeGuide";
import "../homeGuide.css";

interface Props {
  contacts: HomeContact[];
  onChange: (contacts: HomeContact[]) => Promise<void> | void;
  toast: (message: string) => void;
}

const starters = [
  { name: "Plumber", category: "Maintenance", hint: "For a leak that won’t wait." },
  { name: "Electrician", category: "Maintenance", hint: "Keep a trusted number handy." },
  { name: "Gas supplier", category: "Utilities", hint: "Booking number and customer ID." },
  { name: "Home essentials", category: "Home records", hint: "Water valve, meter and spare key locations." },
];

export function HomeGuide({ contacts, onChange, toast }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [draft, setDraft] = useState<HomeContact | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(() => {});
  closeRef.current = () => { if (!pending) { setDraft(null); setError(""); } };
  const categories = [...new Set([...CONTACT_CATEGORIES, ...contacts.map((contact) => contact.category)])];

  useEffect(() => {
    if (!draft) return;
    nameRef.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [draft?.id]);

  const open = (contact?: Partial<HomeContact>) => {
    setDraft({ id: uid(), name: "", category: "Maintenance", phone: "", note: "", ...contact });
    setConfirmDelete(false);
    setError("");
  };
  const commit = async (next: HomeContact[], message: string) => {
    setPending(true);
    setError("");
    try {
      await onChange(next);
      setDraft(null);
      toast(message);
    } catch {
      setError("Your changes could not be saved. Please try again.");
    } finally { setPending(false); }
  };
  const visible = contacts.filter((contact) => (category === "All" || contact.category === category) && `${contact.name} ${contact.phone} ${contact.note}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));

  return (
    <div className="home-guide">
      <div className="home-guide-intro"><div><p className="home-guide-eyebrow">Know where to turn</p><h2>Your home handbook</h2><p>Trusted contacts, service details, and the things only you know about your home.</p></div><button className="btn" onClick={() => open()}>+ Add a record</button></div>
      <div className="home-guide-tools"><div className="field"><label htmlFor="contact-search" className="sr-only">Search home handbook</label><input type="search" id="contact-search" value={query} placeholder="Search names, numbers or notes…" onChange={(event) => setQuery(event.target.value)} /></div><div className="field"><label htmlFor="contact-category" className="sr-only">Filter home handbook</label><select id="contact-category" value={category} onChange={(event) => setCategory(event.target.value)}><option>All</option>{categories.map((entry) => <option key={entry}>{entry}</option>)}</select></div></div>

      {contacts.length === 0 ? <section className="home-guide-empty"><span className="home-guide-symbol" aria-hidden="true">⌂</span><h3>A little preparation goes a long way.</h3><p>Add the people you call for repairs, where the main water valve is, or an appliance’s warranty details. Everything stays on this device.</p><div className="home-guide-starters">{starters.map((starter) => <button key={starter.name} onClick={() => open({ name: starter.name, category: starter.category })}><strong>+ {starter.name}</strong><span>{starter.hint}</span></button>)}</div></section> : <>
        <div className="home-guide-count">{visible.length} record{visible.length === 1 ? "" : "s"}{category !== "All" ? ` in ${category}` : " for your home"}</div>
        {!visible.length && <p className="empty">No records match your search.</p>}
        <div className="home-guide-grid">{visible.map((contact) => {
          const call = phoneLink(contact.phone);
          return <article className="home-guide-card" key={contact.id}><div className="home-guide-card-top"><span className={`home-guide-category${contact.category === "Emergency" ? " home-guide-emergency" : ""}`}>{contact.category || "Other"}</span><button className="home-guide-edit" aria-label={`Edit ${contact.name}`} onClick={() => open(contact)}>Edit ↗</button></div><h3>{contact.name}</h3>{contact.phone && (call ? <a className="home-guide-phone" href={call}>{contact.phone}</a> : <p className="home-guide-phone">{contact.phone}</p>)}{contact.note && <p className="home-guide-note">{contact.note}</p>}</article>;
        })}</div>
      </>}

      {draft && <div className="sheet" onClick={() => closeRef.current()}><form className="panel home-guide-editor" role="dialog" aria-modal="true" aria-labelledby="contact-title" onClick={(event) => event.stopPropagation()} onSubmit={(event) => {
        event.preventDefault();
        if (!draft.name.trim() || pending) return;
        const clean = { ...draft, name: draft.name.trim(), phone: draft.phone.trim(), note: draft.note.trim() };
        void commit([...contacts.filter((contact) => contact.id !== draft.id), clean], "Home record saved");
      }}><div className="home-guide-editor-head"><h3 id="contact-title">{contacts.some((contact) => contact.id === draft.id) ? "Edit home record" : "Add a home record"}</h3><button className="btn ghost small" aria-label="Close home record editor" type="button" onClick={() => closeRef.current()} disabled={pending}>×</button></div>
        <div className="field"><label htmlFor="contact-name">Name or title</label><input id="contact-name" ref={nameRef} value={draft.name} required maxLength={160} placeholder="Plumber, internet connection, main water valve…" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
        <div className="field"><label htmlFor="contact-group">Category</label><select id="contact-group" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categories.map((entry) => <option key={entry}>{entry}</option>)}</select></div>
        <div className="field"><label htmlFor="contact-phone">Phone (optional)</label><input id="contact-phone" type="tel" value={draft.phone} maxLength={40} placeholder="Add a trusted contact number" onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></div>
        <div className="field"><label htmlFor="contact-note">Details (optional)</label><textarea id="contact-note" value={draft.note} placeholder="Customer ID, service date, model number, location, or helpful instructions" onChange={(event) => setDraft({ ...draft, note: event.target.value })} /><p className="hint">Keep passwords and access codes in a password manager.</p></div>
        {error && <p className="home-guide-error" role="alert">{error}</p>}
        <div className="btn-row"><button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save record"}</button><button className="btn ghost" type="button" disabled={pending} onClick={() => closeRef.current()}>Cancel</button></div>
        {contacts.some((contact) => contact.id === draft.id) && <div className="home-guide-delete">{confirmDelete ? <><span>Remove this record?</span><button className="btn danger small" type="button" disabled={pending} onClick={() => void commit(contacts.filter((contact) => contact.id !== draft.id), "Home record removed")}>Yes, remove</button><button className="btn ghost small" type="button" disabled={pending} onClick={() => setConfirmDelete(false)}>Keep it</button></> : <button className="btn danger small" type="button" disabled={pending} onClick={() => setConfirmDelete(true)}>Remove record</button>}</div>}
      </form></div>}
    </div>
  );
}
