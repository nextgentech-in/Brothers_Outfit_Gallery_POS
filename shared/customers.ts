export type Customer = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  birthdayOffersOptIn: boolean;
};

// Date-only values stay in YYYY-MM-DD form; birthdays must not shift with time zones.
export function shopDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}

export function validBirthDate(value: unknown, today = shopDate()): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > today) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function displayBirthDate(value: string) {
  return validBirthDate(value) ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }) : '—';
}

// Indian local mobile numbers use +91; international numbers include their country code.
export function mobileNumber(value: string) {
  const trimmed = value.trim();
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  return /^[1-9]\d{10,14}$/.test(digits) ? digits : '';
}

export function customerDetailsError(phone: string, dateOfBirth: string) {
  if (phone.trim() && !mobileNumber(phone)) return 'Enter a valid mobile number, including the country code for numbers outside India.';
  if (phone.trim() && !dateOfBirth) return 'Enter the customer’s date of birth when adding a mobile number.';
  if (dateOfBirth && !validBirthDate(dateOfBirth)) return 'Enter a valid date of birth from 1900 to today.';
  if (dateOfBirth && !phone.trim()) return 'Enter a mobile number to save the customer’s date of birth.';
  return '';
}
