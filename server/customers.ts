import { customerKey } from './customerIdentity.js';
import { mobileNumber, validBirthDate, type Customer } from '../shared/customers.js';

type CustomerRecord = { id: string; data: Record<string, unknown> };
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function customerProfileFields(input: {
  customerName?: string; customerPhone?: string; customerEmail?: string;
  customerDateOfBirth?: string; birthdayOffersOptIn?: boolean;
  customerAddress?: string;
}) {
  return {
    ...(input.customerName?.trim() ? { name: input.customerName.trim() } : {}),
    ...(input.customerPhone?.trim() ? { phone: mobileNumber(input.customerPhone) } : {}),
    ...(input.customerEmail?.trim() ? { email: input.customerEmail.trim() } : {}),
    ...(input.customerAddress?.trim() ? { address: input.customerAddress.trim() } : {}),
    ...(input.customerDateOfBirth ? { dateOfBirth: input.customerDateOfBirth } : {}),
    ...(input.birthdayOffersOptIn !== undefined ? { birthdayOffersOptIn: input.birthdayOffersOptIn } : {})
  };
}

export function customerDirectory(users: CustomerRecord[], profiles: CustomerRecord[]): Customer[] {
  const customers = new Map<string, Customer>();
  for (const [source, records] of [['website', users], ['pos', profiles]] as const) {
    for (const { id, data } of records) {
      const phone = text(data.phone), email = text(data.email);
      const identity = customerKey(phone, email) || `${source}:${id}`;
      const existing = customers.get(identity);
      const sources = new Set(existing?.sources);
      if (source === 'website' || data.websiteUserId) sources.add('website');
      if (source === 'pos' && (!data.websiteUserId || data.posCustomer === true || data.dateOfBirth)) sources.add('pos');
      customers.set(identity, {
        sources: [...sources],
        id: existing?.id || `${source}:${id}`, customerKey: identity,
        fullName: text(data.fullName) || text(data.name) || existing?.fullName || '',
        phone: phone || existing?.phone || '',
        email: email || existing?.email || '',
        address: text(data.address) || text(data.customerAddress) || existing?.address || '',
        dateOfBirth: validBirthDate(data.dateOfBirth) ? data.dateOfBirth : existing?.dateOfBirth || '',
        birthdayOffersOptIn: source === 'pos' && typeof data.birthdayOffersOptIn === 'boolean'
          ? data.birthdayOffersOptIn : existing?.birthdayOffersOptIn || false
      });
    }
  }
  return [...customers.values()].sort((a, b) => a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id));
}
