export interface HomeContact {
  id: string;
  name: string;
  category: string;
  phone: string;
  note: string;
}

export const CONTACT_CATEGORIES = ["Emergency", "Utilities", "Maintenance", "Home records", "Other"];

export function validHomeContact(raw: unknown): raw is HomeContact {
  if (!raw || typeof raw !== "object") return false;
  const contact = raw as Record<string, unknown>;
  return typeof contact.id === "string" && contact.id.length > 0 &&
    typeof contact.name === "string" && contact.name.trim().length > 0 &&
    typeof contact.category === "string" && typeof contact.phone === "string" &&
    typeof contact.note === "string";
}

export function phoneLink(phone: string): string | null {
  const clean = phone.trim().replace(/[\s().-]/g, "");
  return /^\+?\d{3,20}$/.test(clean) ? `tel:${clean}` : null;
}
