import { rng } from '@pf/core/db';
import { applyRefund, PLANS, schedule } from '../api/plans';
import type { Card, L, OrderItem, PayMethodRef, PlanType, Product, Store, StoreCategory, StoredPayment, User } from '../api/types';
import { addDays, addMonths, round2, today } from '../api/util';

/**
 * Seeds Qist's mock database: 12 fictional partner stores with 6 products each, the demo shopper
 * (approved, limit SAR 5,000, three plans: one with its next instalment due in 3 days, one with an
 * instalment 2 days late, one completed), the demo merchant for store s1 with 25 orders over the
 * last 30 days. Dates are relative to today, so the demo always has a due-soon and a late payment.
 * (The server re-seeds when the day changes, see createQistServer.)
 */
export const SEED_VERSION = 1;

export const demoAccounts = {
  shopper: { phone: '0551234567', name: 'لمى العتيبي' },
  merchant: { phone: '0500003333', name: 'مجوهرات نسمة' },
} as const;

export interface StoredEligibility {
  status: User['eligibility']['status'];
  /** base limit; earned increases are added on read */
  limit: number;
  reason?: 'LOW_SCORE';
  retryAfter?: string;
  score?: number;
  /** a pending review resolves at this epoch-ms time */
  decidesAt?: number;
}
export type DbUser = Omit<User, 'eligibility'> & { eligibility: StoredEligibility };
export type DbCard = Card & { userId: string };
export interface DbOrder {
  id: string;
  code: string;
  storeId: string;
  userId: string;
  /** first name and initial, shown to the store */
  customer: string;
  items: OrderItem[];
  total: number;
  planType: PlanType;
  payments: StoredPayment[];
  refunded: number;
  createdAt: string;
  paymentMethodId: string;
  autopay: boolean;
}

export interface Db {
  users: DbUser[];
  cards: DbCard[];
  stores: Store[];
  products: Product[];
  orders: DbOrder[];
  otps: { requestId: string; phone: string; code: string; expiresAt: number; attempts: number }[];
  /** last issued order number (QS-<seq>) */
  seq: number;
  /** the day this database was seeded (the demo is re-seeded the next day so it never goes stale) */
  seededOn: string;
}

type StoreRow = [id: string, ar: string, en: string, tagAr: string, tagEn: string, cats: StoreCategory[], c1: string, c2: string];
const STORES: StoreRow[] = [
  ['s1', 'مجوهرات نسمة', 'Nasma Jewellery', 'ذهب وألماس بتصاميم عصرية', 'Gold and diamonds, modern designs', ['fashion'], '#9a6b1f', '#e8c26a'],
  ['s2', 'أناقة', 'Anaqa Fashion', 'أزياء يومية بقصّات أنيقة', 'Everyday fashion, elegant cuts', ['fashion'], '#8a3b6b', '#e59ac3'],
  ['s3', 'دار العباية', 'Dar Al-Abaya', 'عبايات وأطقم للمناسبات', 'Abayas and occasion sets', ['fashion'], '#1f2a44', '#7b8fc4'],
  ['s4', 'عالم التقنية', 'Tech World', 'هواتف وأجهزة بأسعار منافسة', 'Phones and gadgets, fair prices', ['electronics'], '#1c4ed8', '#7aa2ff'],
  ['s5', 'فولت', 'Volt', 'ألعاب وأجهزة منزلية ذكية', 'Gaming and smart home', ['electronics', 'home'], '#0e7490', '#67e8f9'],
  ['s6', 'بيتي', 'Baity Home', 'ديكور ومستلزمات المنزل', 'Decor and home essentials', ['home'], '#7c5a2b', '#d9b27a'],
  ['s7', 'ركن الخشب', 'Rukn Wood', 'أثاث خشبي بتصاميم دافئة', 'Wooden furniture, warm designs', ['home'], '#5b3a1e', '#c08a52'],
  ['s8', 'عود وعطر', 'Oud & Attar', 'عطور شرقية وبخور', 'Oriental perfumes and bakhoor', ['beauty'], '#4a2c5a', '#b58acc'],
  ['s9', 'ورد وجمال', 'Ward Beauty', 'عناية بالبشرة والمكياج', 'Skincare and makeup', ['beauty'], '#be185d', '#f9a8d4'],
  ['s10', 'صغار', 'Sighar Kids', 'ملابس ومستلزمات الأطفال', 'Kids clothing and gear', ['kids'], '#d97706', '#fcd34d'],
  ['s11', 'ألعابي', 'Alaaby Toys', 'ألعاب تعليمية وترفيهية', 'Educational and fun toys', ['kids'], '#16a34a', '#86efac'],
  ['s12', 'رحلات سما', 'Sama Travel', 'تذاكر وفنادق وباقات سفر', 'Flights, hotels and travel packages', ['travel'], '#0369a1', '#7dd3fc'],
];

type Row = [ar: string, en: string, price: number];
const PRODUCTS: Record<string, Row[]> = {
  s1: [
    ['خاتم ذهب عيار 18 بحجر زركون', '18K gold zircon ring', 1450],
    ['سوار ذهب أبيض ناعم', 'Slim white gold bracelet', 2300],
    ['عقد لؤلؤ طبيعي', 'Natural pearl necklace', 3800],
    ['أقراط ألماس صغيرة', 'Small diamond studs', 5900],
    ['ساعة نسائية مطلية بالذهب', 'Gold-plated women’s watch', 690],
    ['طقم مجوهرات للمناسبات', 'Occasion jewellery set', 4200],
  ],
  s2: [
    ['فستان سهرة ستان', 'Satin evening dress', 520],
    ['بلوزة كتان صيفية', 'Summer linen blouse', 140],
    ['جاكيت جلد صناعي', 'Faux leather jacket', 380],
    ['حقيبة يد جلدية', 'Leather handbag', 460],
    ['حذاء كعب منخفض', 'Low-heel shoes', 240],
    ['وشاح حرير', 'Silk scarf', 120],
  ],
  s3: [
    ['عباية كريب سوداء', 'Black crepe abaya', 350],
    ['عباية مطرزة يدويًا', 'Hand-embroidered abaya', 1250],
    ['عباية رسمية للعمل', 'Work abaya', 290],
    ['طقم عباية وطرحة', 'Abaya and shayla set', 480],
    ['عباية شتوية بكاب', 'Winter cape abaya', 640],
    ['جلابية منزلية', 'Home jalabiya', 180],
  ],
  s4: [
    ['هاتف ذكي 256 جيجا', 'Smartphone 256GB', 3299],
    ['لابتوب 15 بوصة', '15-inch laptop', 3999],
    ['سماعات لاسلكية', 'Wireless earbuds', 449],
    ['ساعة ذكية', 'Smartwatch', 899],
    ['تابلت 11 بوصة', '11-inch tablet', 1799],
    ['شاحن سريع 65 واط', '65W fast charger', 119],
  ],
  s5: [
    ['جهاز ألعاب منزلي', 'Home gaming console', 1999],
    ['شاشة 55 بوصة 4K', '55-inch 4K TV', 2299],
    ['مكنسة روبوت', 'Robot vacuum', 1499],
    ['مكبر صوت بلوتوث', 'Bluetooth speaker', 329],
    ['كاميرا مراقبة منزلية', 'Home security camera', 249],
    ['قلاية هوائية ذكية', 'Smart air fryer', 399],
  ],
  s6: [
    ['طقم أغطية سرير', 'Bedding set', 360],
    ['سجادة صوف', 'Wool rug', 1150],
    ['مجموعة أواني طبخ', 'Cookware set', 620],
    ['إضاءة طاولة', 'Table lamp', 95],
    ['مرآة جدارية كبيرة', 'Large wall mirror', 540],
    ['طقم فناجين قهوة عربية', 'Arabic coffee cup set', 85],
  ],
  s7: [
    ['كنبة ثلاثية', 'Three-seat sofa', 4200],
    ['طاولة طعام مع 6 كراسي', 'Dining table with 6 chairs', 5800],
    ['مكتب منزلي', 'Home office desk', 1350],
    ['رف كتب', 'Bookshelf', 780],
    ['طاولة تلفاز', 'TV stand', 960],
    ['مجلس عربي أرضي', 'Floor majlis seating', 3900],
  ],
  s8: [
    ['دهن عود كمبودي 3 مل', 'Cambodian oud oil 3ml', 1650],
    ['عطر شرقي 100 مل', 'Oriental perfume 100ml', 420],
    ['مبخرة كهربائية', 'Electric bakhoor burner', 160],
    ['طقم بخور فاخر', 'Luxury bakhoor set', 340],
    ['معطر جو للمجلس', 'Majlis room spray', 95],
    ['عطر مسك أبيض', 'White musk perfume', 210],
  ],
  s9: [
    ['مجموعة عناية بالبشرة', 'Skincare set', 380],
    ['باليت مكياج', 'Makeup palette', 190],
    ['مجفف شعر احترافي', 'Pro hair dryer', 450],
    ['سيروم فيتامين سي', 'Vitamin C serum', 130],
    ['مجموعة أحمر شفاه', 'Lipstick collection', 160],
    ['جهاز تنظيف الوجه', 'Facial cleansing device', 340],
  ],
  s10: [
    ['عربة أطفال خفيفة', 'Lightweight stroller', 890],
    ['كرسي سيارة للأطفال', 'Child car seat', 650],
    ['طقم ملابس مواليد', 'Newborn clothing set', 140],
    ['سرير أطفال خشبي', 'Wooden baby crib', 1100],
    ['حقيبة مدرسية', 'School backpack', 120],
    ['حذاء رياضي للأطفال', 'Kids sneakers', 95],
  ],
  s11: [
    ['مجموعة مكعبات بناء', 'Building blocks set', 160],
    ['دراجة أطفال', 'Kids bike', 520],
    ['بيت دمى كبير', 'Big dollhouse', 430],
    ['سيارة تحكم عن بعد', 'RC car', 210],
    ['لوح رسم ذكي', 'Smart drawing tablet', 75],
    ['لعبة ألغاز تعليمية', 'Educational puzzle', 40],
  ],
  s12: [
    ['تذكرة طيران الرياض - دبي', 'Riyadh to Dubai flight', 1250],
    ['باقة فندق 3 ليالٍ في جدة', '3-night Jeddah hotel', 1800],
    ['رحلة عائلية إلى إسطنبول', 'Family trip to Istanbul', 5900],
    ['عمرة اقتصادية 5 أيام', '5-day Umrah package', 2400],
    ['تذكرة طيران جدة - القاهرة', 'Jeddah to Cairo flight', 1450],
    ['إقامة في منتجع بأبها', 'Abha resort stay', 1350],
  ],
};

const SHADES: [string, string][] = [
  ['#e8efe4', '#bcd3b0'],
  ['#f6ecd8', '#e6c98e'],
  ['#e5eef6', '#a9c6e0'],
  ['#f5e4ea', '#e2aabf'],
  ['#ece6f6', '#c4b3e6'],
  ['#e4f3ee', '#9ad4bf'],
  ['#f7e8e0', '#e9b79b'],
  ['#eceae2', '#cbc6b0'],
];

const FIRST = ['سعد', 'فهد', 'نورة', 'ريم', 'عبدالله', 'سارة', 'خالد', 'منى', 'تركي', 'هند', 'ماجد', 'لينا', 'ناصر', 'أروى', 'بدر', 'جود', 'سلطان', 'شهد', 'يزيد', 'دانة'];
const LAST_INITIAL = ['ع', 'ق', 'ش', 'ح', 'غ', 'د', 'م', 'س', 'ز', 'ر', 'ب', 'ج'];

/** local timestamp on a date, as an ISO string */
const at = (date: string, h: number, m = 0) => {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m).toISOString();
};

export function seed(): Db {
  const r = rng(20241118);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const now = today();
  let seq = 48100;
  let n = 0;

  const stores: Store[] = STORES.map(([id, ar, en, tagAr, tagEn, categories, c1, c2]) => ({ id, name: { ar, en }, tagline: { ar: tagAr, en: tagEn }, categories, palette: [c1, c2] }));
  const products: Product[] = STORES.flatMap(([sid]) =>
    PRODUCTS[sid].map(([ar, en, price], i) => ({ id: `${sid}-p${i + 1}`, storeId: sid, title: { ar, en } as L, price, palette: SHADES[(i + Number(sid.slice(1))) % SHADES.length] })),
  );
  const product = (id: string) => products.find((p) => p.id === id)!;
  const item = (id: string, qty = 1): OrderItem => ({ title: product(id).title, price: product(id).price, qty });
  const sum = (items: OrderItem[]) => round2(items.reduce((a, i) => a + i.price * i.qty, 0));

  /** instalments for an order created on `date`; `paid` decides which ones are settled */
  function build(
    planType: PlanType,
    total: number,
    date: string,
    paid: (p: { n: number; dueDate: string }) => boolean,
    method: PayMethodRef,
    tweak?: (s: { n: number; dueDate: string; amount: number }[]) => void,
  ): StoredPayment[] {
    const s = schedule(planType, total, date);
    tweak?.(s);
    return s.map((p) =>
      paid(p) ? { ...p, status: 'paid' as const, paidAt: at(p.n === 1 && PLANS[planType].firstToday ? date : p.dueDate, 9 + (p.n % 6), 10 + p.n), method } : { ...p, status: 'upcoming' as const },
    );
  }

  const orders: DbOrder[] = [];
  const order = (o: Omit<DbOrder, 'id' | 'code' | 'refunded'> & { refunded?: number }) => {
    orders.push({ id: `o${++n}`, code: `QS-${++seq}`, refunded: 0, ...o });
  };

  /* ── the demo shopper: one due soon, one late, one completed ── */
  const DEMO = 'u-demo-shopper';
  const mada: PayMethodRef = { type: 'mada', last4: '4821' };

  // A: pay4, started 25 days ago: 2 paid, the 3rd is due in 3 days (autopay is on)
  const aItems = [item('s4-p4'), item('s4-p6')];
  const aStart = addDays(now, -25);
  order({
    storeId: 's4', userId: DEMO, customer: 'لمى ع.', items: aItems, total: sum(aItems), planType: 'pay4', createdAt: at(aStart, 18, 20), paymentMethodId: 'c-demo-mada', autopay: true,
    payments: build('pay4', sum(aItems), aStart, (p) => p.dueDate <= now, mada),
  });

  // B: pay3, the 2nd instalment fell due 2 days ago and was not paid: late, with a late fee (autopay is off)
  const bItems = [item('s2-p1'), item('s2-p6')];
  const bDue = addDays(now, -2);
  const bStart = addMonths(bDue, -1);
  order({
    storeId: 's2', userId: DEMO, customer: 'لمى ع.', items: bItems, total: sum(bItems), planType: 'pay3', createdAt: at(bStart, 21, 5), paymentMethodId: 'c-demo-visa', autopay: false,
    payments: build('pay3', sum(bItems), bStart, (p) => p.n === 1, { type: 'visa', last4: '1190' }, (s) => void (s[1].dueDate = bDue)),
  });

  // C: pay6, finished: six monthly instalments, all paid on their due date
  const cItems = [item('s7-p3'), item('s7-p4')];
  const cStart = addDays(addMonths(now, -6), -10);
  order({
    storeId: 's7', userId: DEMO, customer: 'لمى ع.', items: cItems, total: sum(cItems), planType: 'pay6', createdAt: at(cStart, 12, 40), paymentMethodId: 'c-demo-mada', autopay: false,
    payments: build('pay6', sum(cItems), cStart, () => true, mada),
  });

  /* ── the demo merchant's store (s1): 25 orders over the last 30 days, a few today ── */
  const agos = [0, 0, 0, 1, 1, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 16, 18, 20, 22, 24, 27, 29];
  const s1 = products.filter((p) => p.storeId === 's1');
  agos.forEach((ago, i) => {
    const date = addDays(now, -ago);
    const items = [item(pick(s1).id), ...(r() < 0.3 ? [item(pick(s1).id)] : [])];
    const total = sum(items);
    const roll = r();
    const planType: PlanType = total <= 1500 && roll < 0.2 ? 'later30' : total >= 500 && roll < 0.38 ? 'pay6' : roll < 0.7 ? 'pay4' : 'pay3';
    let broke = false;
    const method: PayMethodRef = { type: pick(['mada', 'mada', 'visa', 'mastercard'] as const), last4: String(1000 + Math.floor(r() * 8999)) };
    let payments = build(planType, total, date, (p) => {
      if (p.dueDate > now || broke) return false;
      if (p.n > 1 && r() < 0.06) broke = true;
      return !broke;
    }, method);
    let refunded = 0;
    if (i === 4 || i === 12) {
      refunded = round2(total * 0.25);
      payments = applyRefund(payments, refunded);
    }
    order({ storeId: 's1', userId: `u-ext-${i}`, customer: `${pick(FIRST)} ${pick(LAST_INITIAL)}.`, items, total, planType, payments, refunded, createdAt: at(date, 9 + Math.floor(r() * 12), Math.floor(r() * 60)), paymentMethodId: 'x', autopay: false });
  });
  orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const users: DbUser[] = [
    { id: DEMO, name: demoAccounts.shopper.name, phone: '+966551234567', role: 'shopper', storeId: null, createdAt: at(cStart, 12, 0), eligibility: { status: 'approved', limit: 5000, score: 82 } },
    { id: 'u-demo-merchant', name: demoAccounts.merchant.name, phone: '+966500003333', role: 'merchant', storeId: 's1', createdAt: at(addDays(now, -90), 10, 0), eligibility: { status: 'none', limit: 0 } },
  ];
  const cards: DbCard[] = [
    { id: 'c-demo-mada', userId: DEMO, brand: 'mada', last4: '4821', expiry: `09/${String(new Date().getFullYear() + 3).slice(2)}`, default: true },
    { id: 'c-demo-visa', userId: DEMO, brand: 'visa', last4: '1190', expiry: `03/${String(new Date().getFullYear() + 2).slice(2)}`, default: false },
  ];

  return { users, cards, stores, products, orders, otps: [], seq, seededOn: now };
}
