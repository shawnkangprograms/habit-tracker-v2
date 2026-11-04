// Home's greeting (docs/HABITQUEST_DESIGN.md, names decision). Pure: the hour comes from the phone's clock in
// the caller. Morning before 12:00, afternoon 12:00 to 16:59, evening from 17:00.

export function partOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// "Good evening, Ama"; with no name, no comma
export function greetingFor(hour: number, firstName: string | null | undefined): string {
  const greeting = `Good ${partOfDay(hour)}`;
  const name = firstName?.trim();
  return name ? `${greeting}, ${name}` : greeting;
}

// The first name to greet: the stored one, else the first word of the Auth displayName (accounts from before
// names were asked for), else none
export function firstNameFor(stored: string | null | undefined, displayName: string | null | undefined): string | null {
  const own = stored?.trim();
  if (own) return own;
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first : null;
}
