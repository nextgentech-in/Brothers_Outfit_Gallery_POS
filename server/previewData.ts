import type { DashboardSummary } from '../shared/contracts.js';
import type { Customer } from '../shared/customers.js';

export function previewShopDetails() {
  return {
    name: 'Brothers Outfit Gallery',
    phone: '+91 84602 33020',
    address: 'FF-57, Pratham Square, Sahakari Jin Road, Himatnagar, Gujarat 383001',
    email: 'brothersoutfitgallery@gmail.com',
    whatsapp: '918460233020',
    logo: '/favicon.svg'
  };
}

export function previewDashboard(): DashboardSummary {
  const now = new Date();
  return {
    products: 124,
    variants: 348,
    customers: 245,
    orders: 312,
    availableUnits: 890,
    stockRetailValue: 1450200,
    lowStock: 12,
    outOfStock: 4,
    recentSales: 89450,
    websiteSales: 54200,
    posSales: 35250,
    pendingOrders: 3,
    syncFailures: 0,
    sampledOrders: 80,
    checkedAt: now.toISOString(),
    businessWritesEnabled: false,
    lowStockItems: [
      { id: 'prod-1', name: 'Slim Fit Oxford Shirt - Navy', sku: 'SFO-NAV-M', available: 2 },
      { id: 'prod-2', name: 'Vintage Denim Jacket - Blue', sku: 'VDJ-BLU-L', available: 1 },
      { id: 'prod-3', name: 'Stretch Chino Trousers - Olive', sku: 'SCT-OLV-32', available: 3 },
      { id: 'prod-4', name: 'Premium Linen Kurta - White', sku: 'PLK-WHT-XL', available: 2 }
    ],
    recentOrders: [
      { id: 'ORD-1095', customer: 'Rahul Sharma', channel: 'POS', status: 'Delivered', total: 2499, createdAt: new Date(Date.now() - 3600000).toISOString() },
      { id: 'ORD-1094', customer: 'Amit Patel', channel: 'Website', status: 'Confirmed', total: 1799, createdAt: new Date(Date.now() - 14400000).toISOString() },
      { id: 'ORD-1093', customer: 'Priya Verma', channel: 'Website', status: 'Packed', total: 3200, createdAt: new Date(Date.now() - 28800000).toISOString() },
      { id: 'ORD-1092', customer: 'Karan Mehta', channel: 'POS', status: 'Delivered', total: 1299, createdAt: new Date(Date.now() - 86400000).toISOString() }
    ]
  };
}

export function previewCustomers(): Customer[] {
  const today = new Date().toISOString().slice(5, 10); // MM-DD
  return [
    {
      id: 'cust-1',
      fullName: 'Rahul Sharma',
      phone: '918460233020',
      email: 'rahul.sharma@example.com',
      dateOfBirth: `1995-${today}`, // Birthday today for testing!
      birthdayOffersOptIn: true
    },
    {
      id: 'cust-2',
      fullName: 'Amit Patel',
      phone: '919876543210',
      email: 'amit.patel@example.com',
      dateOfBirth: '1992-11-15',
      birthdayOffersOptIn: true
    },
    {
      id: 'cust-3',
      fullName: 'Priya Verma',
      phone: '919823456789',
      email: 'priya.v@example.com',
      dateOfBirth: '1998-04-20',
      birthdayOffersOptIn: true
    },
    {
      id: 'cust-4',
      fullName: 'Karan Mehta',
      phone: '919712345678',
      email: 'karan.m@example.com',
      dateOfBirth: '1990-08-10',
      birthdayOffersOptIn: false
    },
    {
      id: 'cust-5',
      fullName: 'Deepak Joshi',
      phone: '919909012345',
      email: 'deepak.j@example.com',
      dateOfBirth: '1994-11-28',
      birthdayOffersOptIn: true
    }
  ];
}

export function previewProducts() {
  return [
    {
      id: 'prod-1',
      name: 'Slim Fit Oxford Shirt',
      sku: 'SFO-NAV',
      barcode: '890123450001',
      price: 1299,
      mrp: 1799,
      costPrice: 650,
      category: 'Shirts',
      subCategory: 'Casual',
      active: true,
      stock: 15,
      variants: [
        { sku: 'SFO-NAV-S', size: 'S', color: 'Navy', stock: 5, price: 1299, costPrice: 650 },
        { sku: 'SFO-NAV-M', size: 'M', color: 'Navy', stock: 2, price: 1299, costPrice: 650 },
        { sku: 'SFO-NAV-L', size: 'L', color: 'Navy', stock: 8, price: 1299, costPrice: 650 }
      ]
    },
    {
      id: 'prod-2',
      name: 'Vintage Denim Jacket',
      sku: 'VDJ-BLU',
      barcode: '890123450002',
      price: 2499,
      mrp: 3499,
      costPrice: 1200,
      category: 'Jackets',
      subCategory: 'Denim',
      active: true,
      stock: 7,
      variants: [
        { sku: 'VDJ-BLU-M', size: 'M', color: 'Blue', stock: 6, price: 2499, costPrice: 1200 },
        { sku: 'VDJ-BLU-L', size: 'L', color: 'Blue', stock: 1, price: 2499, costPrice: 1200 }
      ]
    },
    {
      id: 'prod-3',
      name: 'Stretch Chino Trousers',
      sku: 'SCT-OLV',
      barcode: '890123450003',
      price: 1499,
      mrp: 1999,
      costPrice: 750,
      category: 'Trousers',
      subCategory: 'Chinos',
      active: true,
      stock: 20,
      variants: [
        { sku: 'SCT-OLV-30', size: '30', color: 'Olive', stock: 7, price: 1499, costPrice: 750 },
        { sku: 'SCT-OLV-32', size: '32', color: 'Olive', stock: 3, price: 1499, costPrice: 750 },
        { sku: 'SCT-OLV-34', size: '34', color: 'Olive', stock: 10, price: 1499, costPrice: 750 }
      ]
    },
    {
      id: 'prod-4',
      name: 'Premium Linen Kurta',
      sku: 'PLK-WHT',
      barcode: '890123450004',
      price: 1699,
      mrp: 2299,
      costPrice: 800,
      category: 'Ethnic',
      subCategory: 'Kurtas',
      active: true,
      stock: 12,
      variants: [
        { sku: 'PLK-WHT-M', size: 'M', color: 'White', stock: 5, price: 1699, costPrice: 800 },
        { sku: 'PLK-WHT-L', size: 'L', color: 'White', stock: 5, price: 1699, costPrice: 800 },
        { sku: 'PLK-WHT-XL', size: 'XL', color: 'White', stock: 2, price: 1699, costPrice: 800 }
      ]
    }
  ];
}

export function previewOrders() {
  return [
    {
      id: 'ORD-1095',
      customerName: 'Rahul Sharma',
      createdBy: 'admin-pos',
      paymentMethod: 'UPI',
      totalAmount: 2499,
      status: 'Delivered',
      items: [{ name: 'Slim Fit Oxford Shirt', quantity: 1 }, { name: 'Stretch Chino Trousers', quantity: 1 }]
    },
    {
      id: 'ORD-1094',
      customerName: 'Amit Patel',
      createdBy: 'website',
      paymentMethod: 'Card',
      totalAmount: 1799,
      status: 'Confirmed',
      items: [{ name: 'Premium Linen Kurta', quantity: 1 }]
    },
    {
      id: 'ORD-1093',
      customerName: 'Priya Verma',
      createdBy: 'website',
      paymentMethod: 'UPI',
      totalAmount: 3200,
      status: 'Packed',
      items: [{ name: 'Vintage Denim Jacket', quantity: 1 }]
    }
  ];
}


import type { CreditCustomer, CreditEntry } from '../shared/credit.js';

let creditCustomersState: CreditCustomer[] = [
  {
    customerKey: 'phone_e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    name: 'Rahul Sharma',
    phone: '918460233020',
    dateOfBirth: '1995-11-04',
    creditWhatsAppOptIn: true,
    summary: {
      balance: 4500,
      given: 8000,
      received: 3500,
      adjusted: 0,
      overdue: 0,
      nextDueDate: '2026-11-20',
      undated: 0,
      debts: [{ id: 'debt-1', remaining: 450000, dueDate: '2026-11-20' }]
    }
  },
  {
    customerKey: 'phone_ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    name: 'Amit Patel',
    phone: '919876543210',
    dateOfBirth: '1992-11-15',
    creditWhatsAppOptIn: true,
    summary: {
      balance: 2800,
      given: 5000,
      received: 2200,
      adjusted: 0,
      overdue: 2800,
      nextDueDate: '2026-10-30',
      undated: 0,
      debts: [{ id: 'debt-2', remaining: 280000, dueDate: '2026-10-30' }]
    }
  },
  {
    customerKey: 'phone_4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    name: 'Priya Verma',
    phone: '919823456789',
    dateOfBirth: '1998-04-20',
    creditWhatsAppOptIn: true,
    summary: {
      balance: 1200,
      given: 3200,
      received: 2000,
      adjusted: 0,
      overdue: 0,
      nextDueDate: '2026-11-25',
      undated: 0,
      debts: [{ id: 'debt-3', remaining: 120000, dueDate: '2026-11-25' }]
    }
  },
  {
    customerKey: 'phone_ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
    name: 'Karan Mehta',
    phone: '919712345678',
    dateOfBirth: '1990-08-10',
    creditWhatsAppOptIn: false,
    summary: {
      balance: 0,
      given: 3500,
      received: 3500,
      adjusted: 0,
      overdue: 0,
      nextDueDate: null,
      undated: 0,
      debts: []
    }
  }
];

let creditEntriesState: Record<string, CreditEntry[]> = {
  'phone_e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855': [
    { id: 'ent-1', customerKey: 'phone_e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', creditDelta: 8000, kind: 'credit', dueDate: '2026-11-20', note: 'Wedding collection shopping', createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
    { id: 'ent-2', customerKey: 'phone_e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', creditDelta: -3500, kind: 'payment', paymentMethod: 'UPI', note: 'Partial payment', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() }
  ],
  'phone_ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb': [
    { id: 'ent-3', customerKey: 'phone_ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb', creditDelta: 5000, kind: 'credit', dueDate: '2026-10-30', note: 'Festival purchase', createdAt: new Date(Date.now() - 86400000 * 12).toISOString() },
    { id: 'ent-4', customerKey: 'phone_ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb', creditDelta: -2200, kind: 'payment', paymentMethod: 'Cash', note: 'Cash payment', createdAt: new Date(Date.now() - 86400000 * 7).toISOString() }
  ],
  'phone_4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a': [
    { id: 'ent-5', customerKey: 'phone_4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a', creditDelta: 3200, kind: 'credit', dueDate: '2026-11-25', note: 'Denim jacket & pants', createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
    { id: 'ent-6', customerKey: 'phone_4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a', creditDelta: -2000, kind: 'payment', paymentMethod: 'UPI', note: 'UPI Google Pay', createdAt: new Date(Date.now() - 86400000).toISOString() }
  ]
};

export function previewCreditCustomers(): CreditCustomer[] {
  return creditCustomersState;
}

export function previewCreditCustomerDetail(key: string) {
  const customer = creditCustomersState.find(c => c.customerKey === key);
  if (!customer) return null;
  const entries = creditEntriesState[key] || [];
  return { customer, entries };
}

export function recordPreviewPayment(customerKey: string, amount: number, paymentMethod: string, note = '') {
  const customer = creditCustomersState.find(c => c.customerKey === customerKey);
  if (!customer) throw new Error('Customer not found');
  if (amount > customer.summary.balance) throw new Error('Payment cannot exceed the outstanding balance.');

  const newBalance = Math.max(0, customer.summary.balance - amount);
  customer.summary.balance = newBalance;
  customer.summary.received += amount;
  if (customer.summary.overdue > 0) {
    customer.summary.overdue = Math.max(0, customer.summary.overdue - amount);
  }

  const newEntry: CreditEntry = {
    id: `ent-${Date.now()}`,
    customerKey,
    creditDelta: -amount,
    kind: 'payment',
    paymentMethod,
    note,
    createdAt: new Date().toISOString()
  };

  if (!creditEntriesState[customerKey]) creditEntriesState[customerKey] = [];
  creditEntriesState[customerKey].unshift(newEntry);

  return { customerKey, balance: newBalance };
}

export type PreviewInvoice = {
  id: string;
  orderId?: string;
  customBillNumber?: string;
  billingDate?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  lines: { name?: string; sku?: string; quantity: number; price: number }[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  channel: string;
  createdAt?: { _seconds: number; seconds: number };
};

const previewInvoicesMap = new Map<string, PreviewInvoice>();

export function savePreviewInvoice(invoice: PreviewInvoice) {
  previewInvoicesMap.set(invoice.id, invoice);
  if (invoice.customBillNumber) {
    previewInvoicesMap.set(invoice.customBillNumber, invoice);
  }
}

export function getPreviewInvoice(id: string): PreviewInvoice | undefined {
  return previewInvoicesMap.get(id);
}
