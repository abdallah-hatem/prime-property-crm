import { createHash } from 'node:crypto';
import type {
  Furnishing,
  LeadStatus,
  ListingPurpose,
  ListingStatus,
  Prisma,
  PrismaClient,
  PropertyType,
  ReminderKind,
} from '@prisma/client';
import { DEFAULT_CALL_OUTCOMES } from '@prime-crm/shared';
import {
  hashPassword,
  verifyPassword,
} from '../src/common/utils/password.util';

/**
 * Sample data for local and preview databases: an account per role and records in every state
 * each flow moves through, with Arabic beside English. Runs after the foundation seed
 * (prisma/seed.ts) only when SEED_ALLOW_SAMPLE=true, and never with NODE_ENV=production.
 *
 * Deterministic: every row has a fixed id (derived from a natural key by `sampleId`) or a natural
 * key (users by email, the custom role by name), and is upserted back to its fixture state. A
 * re-run changes no row count, and puts the sample records back the way a flow expects them
 * (times are relative to `now`, so "overdue", "due today" and "deleted 5 days ago" stay true).
 * Rows created by people or tests are never touched.
 */

export const SAMPLE_ACCOUNTS = {
  admin: 'admin@prime.test',
  sara: 'sara@prime.test',
  omar: 'omar@prime.test',
  lead: 'layla@prime.test',
  deactivated: 'karim@prime.test',
} as const;

export const TEAM_LEAD_ROLE = {
  name: 'Team lead',
  permissions: ['owners.assign', 'analytics.view'],
} as const;

export const SAMPLE_AREAS = [
  'New Cairo',
  'Fifth Settlement',
  'Sheikh Zayed',
  'Madinaty',
  '6th October',
  'Maadi',
] as const;

export interface SampleSeedOptions {
  /** Password for admin@prime.test (SEED_ADMIN_PASSWORD). */
  adminPassword: string;
  /** Password for every other sample account (SEED_MEMBER_PASSWORD). */
  memberPassword: string;
  /** Reference time; defaults to now. */
  now?: Date;
}

export interface SampleSeedResult {
  users: number;
  owners: number;
  phones: number;
  calls: number;
  reminders: number;
  notes: number;
  listings: number;
  photos: number;
  importRows: number;
  activity: number;
}

/**
 * Whether sample data may be written: 'run' with SEED_ALLOW_SAMPLE=true, 'skip' when the flag is
 * unset or anything else, and an error when the flag is set with NODE_ENV=production.
 */
export function sampleSeedGate(env: {
  NODE_ENV?: string;
  SEED_ALLOW_SAMPLE?: string;
}): 'run' | 'skip' {
  const allowed = env.SEED_ALLOW_SAMPLE?.trim().toLowerCase() === 'true';
  if (!allowed) return 'skip';
  if (env.NODE_ENV?.trim().toLowerCase() === 'production')
    throw new Error(
      'Refusing to write sample data with NODE_ENV=production (unset SEED_ALLOW_SAMPLE)',
    );
  return 'run';
}

/** A stable UUID (v5 layout) for a sample row, from its kind and key. */
export function sampleId(kind: string, key: string | number): string {
  const hex = createHash('sha1')
    .update(`prime-crm-sample:${kind}:${key}`)
    .digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ------------------------------------------------------------------ time

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The instant the current Africa/Cairo calendar day ends. */
export function cairoEndOfDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZoneName: 'longOffset',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const m = get('timeZoneName').match(/GMT([+-])(\d{2}):(\d{2})/);
  const offset = m
    ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * MINUTE
    : 0;
  return new Date(
    Date.UTC(
      Number(get('year')),
      Number(get('month')) - 1,
      Number(get('day')) + 1,
    ) - offset,
  );
}

// -------------------------------------------------------------- fixtures

const NAMES_AR = [
  'محمد عبد الرحمن',
  'أحمد السيد',
  'فاطمة حسن',
  'منى إبراهيم',
  'خالد مصطفى',
  'ياسمين فاروق',
  'عمرو عادل',
  'هبة الله سامي',
  'طارق النجار',
  'نادية رشاد',
  'حسام الدين علي',
  'رانيا شوقي',
  'إبراهيم الشافعي',
  'سلمى عزت',
  'وليد منصور',
  'دينا كمال',
  'مصطفى الجمال',
  'نورا عبد العزيز',
  'شريف حلمي',
  'إيمان صبري',
  'أيمن زكي',
  'ريهام توفيق',
  'سامح البنا',
  'مها الشربيني',
  'عادل القاضي',
  'هالة يوسف',
  'جمال سالم',
  'لبنى مراد',
  'حازم عبد الله',
  'سوسن جلال',
];

const NAMES_EN = [
  'Ahmed Fathy',
  'Mariam Nabil',
  'Youssef Kamel',
  'Nour El-Din Samir',
  'Laila Hamdy',
  'Tamer Saleh',
  'Dalia Osman',
  'Hesham Barakat',
  'Rana Mostafa',
  'Sherif Zaki',
  'Heba Lotfy',
  'Karim Abdelaziz',
  'Yasmin Sobhy',
  'Mostafa Gaber',
  'Noha Farid',
  'Amr Shalaby',
  'Salma Youssef',
  'Ramy Fouad',
  'Ingy Hassan',
  'Waleed Tawfik',
  'Mai Ezzat',
  'Khaled Selim',
  'Nada Ashraf',
  'Omar Galal',
  'Reem Sabry',
  'Adel Shaker',
  'Hana Magdy',
  'Bassem Wahba',
  'Fady Nassar',
];

const NOTES_EN = [
  'Prefers calls after 6 pm.',
  'Owns two units in the same compound; wants to sell the smaller one first.',
  'Asked for a valuation before deciding.',
  'His wife decides — call her on the second number.',
  'Travelling until next month, call back then.',
];

const NOTES_AR = [
  'يفضل الاتصال بعد الساعة السادسة مساءً.',
  'المالك يريد سعرًا أعلى من سعر السوق.',
  'طلب زيارة من المندوب قبل الإعلان.',
  'الشقة مؤجرة حاليًا حتى نهاية العام.',
  'يرجى التواصل عبر واتساب أولًا.',
];

/** Lead statuses and how many live sample owners hold each (59 + 1 trashed = 60). */
const STATUS_COUNTS: readonly [LeadStatus, number][] = [
  ['NEW', 14],
  ['CONTACTED', 11],
  ['INTERESTED', 8],
  ['NOT_INTERESTED', 6],
  ['CALL_BACK', 7],
  ['LISTED', 8],
  ['DO_NOT_CALL', 5],
];

/** The final outcome (by default English label) each status's calls end on, cycled per owner. */
const FINAL_OUTCOMES: Record<Exclude<LeadStatus, 'NEW'>, readonly string[]> = {
  CONTACTED: ['No answer', 'Busy', 'Switched off'],
  INTERESTED: ['Interested to sell', 'Interested to rent'],
  NOT_INTERESTED: ['Not interested', 'Already sold or rented'],
  CALL_BACK: ['Call back later'],
  LISTED: ['Interested to sell', 'Interested to rent'],
  DO_NOT_CALL: ['Wrong number', 'Do not call again'],
};

const TRASHED_OWNER_N = 60;
const IMPORTED_COUNT = 12;

type Ad = 'notPosted' | 'liveDue' | 'liveFine' | 'takeDownOpen' | 'takenDown';
type Who = 'sara' | 'omar' | null;

interface ListingFixture {
  n: number;
  /** Index among the LISTED owners for a linked listing; absent for a direct listing. */
  listedOwner?: number;
  direct?: { name: string; assignee: Who };
  purpose: ListingPurpose;
  type: PropertyType;
  area: (typeof SAMPLE_AREAS)[number];
  compound?: string;
  address?: string;
  sizeSqm: number;
  floor?: number;
  bedrooms?: number;
  bathrooms?: number;
  price: number;
  furnishing?: Furnishing;
  status: ListingStatus;
  ad: Ad;
  photos: number;
  description?: string;
  trashed?: boolean;
}

const LISTINGS: readonly ListingFixture[] = [
  {
    n: 1,
    listedOwner: 0,
    purpose: 'SALE',
    type: 'APARTMENT',
    area: 'New Cairo',
    compound: 'Mivida',
    sizeSqm: 165,
    floor: 3,
    bedrooms: 3,
    bathrooms: 2,
    price: 7_800_000,
    furnishing: 'SEMI_FURNISHED',
    status: 'AVAILABLE',
    ad: 'liveDue',
    photos: 3,
    description: 'Garden view, finished, ready to move.',
  },
  {
    n: 2,
    listedOwner: 1,
    purpose: 'RENT',
    type: 'APARTMENT',
    area: 'Fifth Settlement',
    compound: 'Eastown',
    sizeSqm: 140,
    floor: 5,
    bedrooms: 2,
    bathrooms: 2,
    price: 38_000,
    furnishing: 'FURNISHED',
    status: 'AVAILABLE',
    ad: 'liveFine',
    photos: 4,
    description: 'شقة مفروشة بالكامل بإطلالة على اللاندسكيب.',
  },
  {
    n: 3,
    listedOwner: 2,
    purpose: 'SALE',
    type: 'VILLA',
    area: 'Sheikh Zayed',
    compound: 'Allegria',
    sizeSqm: 420,
    bedrooms: 5,
    bathrooms: 5,
    price: 32_000_000,
    furnishing: 'UNFURNISHED',
    status: 'AVAILABLE',
    ad: 'notPosted',
    photos: 2,
  },
  {
    n: 4,
    listedOwner: 3,
    purpose: 'SALE',
    type: 'DUPLEX',
    area: 'Madinaty',
    compound: 'B8',
    sizeSqm: 250,
    floor: 4,
    bedrooms: 4,
    bathrooms: 3,
    price: 9_500_000,
    furnishing: 'SEMI_FURNISHED',
    status: 'SOLD',
    ad: 'takeDownOpen',
    photos: 3,
  },
  {
    n: 5,
    listedOwner: 4,
    purpose: 'RENT',
    type: 'PENTHOUSE',
    area: 'New Cairo',
    compound: 'Hyde Park',
    sizeSqm: 210,
    floor: 8,
    bedrooms: 3,
    bathrooms: 3,
    price: 85_000,
    furnishing: 'FURNISHED',
    status: 'RENTED',
    ad: 'takenDown',
    photos: 2,
    description: 'بنتهاوس بتراس واسع.',
  },
  {
    n: 6,
    listedOwner: 5,
    purpose: 'SALE',
    type: 'TOWNHOUSE',
    area: '6th October',
    compound: 'Palm Hills October',
    sizeSqm: 280,
    bedrooms: 4,
    bathrooms: 4,
    price: 14_000_000,
    furnishing: 'UNFURNISHED',
    status: 'AVAILABLE',
    ad: 'liveFine',
    photos: 2,
  },
  {
    n: 7,
    listedOwner: 6,
    purpose: 'RENT',
    type: 'STUDIO',
    area: 'Maadi',
    address: 'Street 9, Maadi',
    sizeSqm: 55,
    floor: -1,
    bedrooms: 0,
    bathrooms: 1,
    price: 16_000,
    furnishing: 'FURNISHED',
    status: 'AVAILABLE',
    ad: 'notPosted',
    photos: 1,
  },
  {
    n: 8,
    listedOwner: 7,
    purpose: 'SALE',
    type: 'TWIN_HOUSE',
    area: 'Sheikh Zayed',
    compound: 'Zayed Dunes',
    sizeSqm: 320,
    bedrooms: 4,
    bathrooms: 4,
    price: 18_500_000,
    status: 'OFF_MARKET',
    ad: 'notPosted',
    photos: 0,
  },
  {
    n: 9,
    direct: { name: 'Hossam Badr', assignee: 'sara' },
    purpose: 'RENT',
    type: 'CHALET',
    area: 'New Cairo',
    compound: 'Mountain View iCity',
    sizeSqm: 120,
    floor: 1,
    bedrooms: 2,
    bathrooms: 2,
    price: 30_000,
    furnishing: 'FURNISHED',
    status: 'AVAILABLE',
    ad: 'liveFine',
    photos: 3,
  },
  {
    n: 10,
    direct: { name: 'شركة النيل للاستثمار', assignee: 'omar' },
    purpose: 'SALE',
    type: 'OFFICE',
    area: 'Fifth Settlement',
    compound: 'Eastown',
    sizeSqm: 90,
    floor: 2,
    bathrooms: 1,
    price: 4_200_000,
    status: 'AVAILABLE',
    ad: 'liveFine',
    photos: 2,
  },
  {
    n: 11,
    direct: { name: 'Magdy Rizk', assignee: 'sara' },
    purpose: 'RENT',
    type: 'SHOP',
    area: 'Maadi',
    address: 'Road 9, Maadi',
    sizeSqm: 60,
    floor: 0,
    bathrooms: 1,
    price: 45_000,
    status: 'AVAILABLE',
    ad: 'notPosted',
    photos: 1,
  },
  {
    n: 12,
    direct: { name: 'سمير عبد الملك', assignee: 'omar' },
    purpose: 'SALE',
    type: 'LAND',
    area: '6th October',
    sizeSqm: 600,
    price: 6_000_000,
    status: 'AVAILABLE',
    ad: 'notPosted',
    photos: 0,
    description: 'أرض سكنية على شارعين.',
  },
  {
    n: 13,
    direct: { name: 'Nadia Helmy', assignee: 'sara' },
    purpose: 'RENT',
    type: 'APARTMENT',
    area: 'Madinaty',
    compound: 'Privado',
    sizeSqm: 120,
    floor: 2,
    bedrooms: 2,
    bathrooms: 1,
    price: 22_000,
    furnishing: 'UNFURNISHED',
    status: 'AVAILABLE',
    ad: 'liveFine',
    photos: 2,
  },
  {
    n: 14,
    direct: { name: 'عصام فهمي', assignee: 'omar' },
    purpose: 'SALE',
    type: 'APARTMENT',
    area: 'Maadi',
    compound: 'Degla',
    sizeSqm: 180,
    floor: 6,
    bedrooms: 3,
    bathrooms: 2,
    price: 8_900_000,
    furnishing: 'SEMI_FURNISHED',
    status: 'SOLD',
    ad: 'takenDown',
    photos: 3,
  },
  {
    n: 15,
    direct: { name: 'Lamia Fawzy', assignee: 'sara' },
    purpose: 'RENT',
    type: 'VILLA',
    area: 'New Cairo',
    compound: 'Katameya Heights',
    sizeSqm: 500,
    bedrooms: 6,
    bathrooms: 6,
    price: 150_000,
    furnishing: 'FURNISHED',
    status: 'RENTED',
    ad: 'notPosted',
    photos: 2,
  },
  {
    n: 16,
    direct: { name: 'رأفت حبيب', assignee: 'omar' },
    purpose: 'SALE',
    type: 'STUDIO',
    area: '6th October',
    compound: 'O West',
    sizeSqm: 65,
    floor: 1,
    bedrooms: 0,
    bathrooms: 1,
    price: 2_600_000,
    status: 'OFF_MARKET',
    ad: 'takenDown',
    photos: 1,
  },
  {
    n: 17,
    direct: { name: 'Ola Shafik', assignee: null },
    purpose: 'RENT',
    type: 'DUPLEX',
    area: 'Sheikh Zayed',
    compound: 'Allegria',
    sizeSqm: 230,
    floor: 3,
    bedrooms: 3,
    bathrooms: 3,
    price: 60_000,
    furnishing: 'SEMI_FURNISHED',
    status: 'AVAILABLE',
    ad: 'notPosted',
    photos: 0,
  },
  {
    n: 18,
    direct: { name: 'نبيل الحسيني', assignee: 'sara' },
    purpose: 'SALE',
    type: 'PENTHOUSE',
    area: 'Fifth Settlement',
    sizeSqm: 190,
    floor: 9,
    bedrooms: 3,
    bathrooms: 3,
    price: 12_000_000,
    furnishing: 'UNFURNISHED',
    status: 'AVAILABLE',
    ad: 'liveFine',
    photos: 2,
  },
  {
    n: 19,
    direct: { name: 'Tarek Ghali', assignee: 'omar' },
    purpose: 'RENT',
    type: 'OFFICE',
    area: 'New Cairo',
    sizeSqm: 150,
    floor: 4,
    bathrooms: 2,
    price: 70_000,
    status: 'AVAILABLE',
    ad: 'notPosted',
    photos: 1,
  },
  {
    n: 20,
    direct: { name: 'سهير المصري', assignee: 'sara' },
    purpose: 'SALE',
    type: 'APARTMENT',
    area: 'Madinaty',
    sizeSqm: 140,
    floor: 3,
    bedrooms: 3,
    bathrooms: 2,
    price: 5_100_000,
    status: 'AVAILABLE',
    ad: 'notPosted',
    photos: 1,
    trashed: true,
  },
];

const pad = (n: number, width: number) => String(n).padStart(width, '0');
/** Sample phones live in reserved blocks (+20 10/11/12/15 555xxxxx), clear of real numbers. */
const ownerPhone = (n: number, slot: number) =>
  `+20${['10', '11', '12'][slot]}555${pad(n, 5)}`;
const directListingPhone = (n: number) => `+2015555${pad(n, 5)}`;
const localFormat = (e164: string) => `0${e164.slice(3)}`;

type WithId<T> = T & { id: string };

interface Rows {
  owners: WithId<Prisma.OwnerCreateManyInput>[];
  phones: WithId<Prisma.OwnerPhoneCreateManyInput>[];
  assignments: WithId<Prisma.OwnerAssignmentCreateManyInput>[];
  calls: WithId<Prisma.CallCreateManyInput>[];
  listings: WithId<Prisma.ListingCreateManyInput>[];
  photos: WithId<Prisma.PhotoCreateManyInput>[];
  reminders: WithId<Prisma.ReminderCreateManyInput>[];
  notes: WithId<Prisma.NoteCreateManyInput>[];
  importRows: WithId<Prisma.ImportRowCreateManyInput>[];
  activity: WithId<Prisma.ActivityEntryCreateManyInput>[];
}

interface OwnerPlan {
  n: number;
  id: string;
  name: string;
  status: LeadStatus;
  /** Index within its status group. */
  k: number;
  assignee: Who;
  imported: boolean;
  /** Calls made by the (now deactivated) member before hand-over. */
  karimHistory: boolean;
  /** The one owner whose latest call has no outcome yet. */
  missingOutcome: boolean;
  phones: string[];
  createdAt: Date;
}

function planOwners(now: Date): OwnerPlan[] {
  const left = new Map(STATUS_COUNTS);
  const statuses: LeadStatus[] = [];
  while (statuses.length < TRASHED_OWNER_N - 1) {
    for (const [status] of STATUS_COUNTS) {
      const remaining = left.get(status) ?? 0;
      if (remaining > 0) {
        statuses.push(status);
        left.set(status, remaining - 1);
      }
    }
  }
  const seen = new Map<LeadStatus, number>();
  const newIdx = statuses
    .map((s, i) => (s === 'NEW' ? i : -1))
    .filter((i) => i >= 0);
  const unassignedNew = new Set(newIdx.slice(-5));
  const unassignedContacted = statuses.lastIndexOf('CONTACTED');
  let missingOutcomeSet = false;

  return statuses.map((status, i) => {
    const n = i + 1;
    const k = seen.get(status) ?? 0;
    seen.set(status, k + 1);
    const imported = n <= IMPORTED_COUNT;
    let assignee: Who = imported ? 'sara' : n % 2 === 1 ? 'sara' : 'omar';
    if (!imported && (unassignedNew.has(i) || i === unassignedContacted))
      assignee = null;
    const karimHistory =
      i === unassignedContacted ||
      (assignee === 'omar' &&
        n % 9 === 0 &&
        status !== 'NEW' &&
        status !== 'LISTED');
    const missingOutcome =
      !missingOutcomeSet &&
      status === 'CONTACTED' &&
      assignee === 'omar' &&
      !karimHistory;
    if (missingOutcome) missingOutcomeSet = true;
    const phoneCount = n % 7 === 0 ? 3 : n % 4 === 0 ? 2 : 1;
    return {
      n,
      id: sampleId('owner', n),
      name: n % 2 === 1 ? NAMES_AR[(n - 1) / 2] : NAMES_EN[n / 2 - 1],
      status,
      k,
      assignee,
      imported,
      karimHistory,
      missingOutcome,
      phones: Array.from({ length: phoneCount }, (_, slot) =>
        ownerPhone(n, slot),
      ),
      createdAt: new Date(
        now.getTime() - (imported ? 20 : 35 + (n % 10)) * DAY,
      ),
    };
  });
}

// ------------------------------------------------------------------ seed

export async function seedSample(
  db: PrismaClient,
  options: SampleSeedOptions,
): Promise<SampleSeedResult> {
  if (options.adminPassword.length < 8 || options.memberPassword.length < 8)
    throw new Error('Sample account passwords must be at least 8 characters');
  const now = options.now ?? new Date();
  const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);
  const endOfToday = cairoEndOfDay(now);
  const dueToday = new Date(
    now.getTime() + (endOfToday.getTime() - now.getTime()) / 2,
  );

  const [adminRole, memberRole] = await Promise.all([
    db.role.findUnique({ where: { builtIn: 'ADMIN' } }),
    db.role.findUnique({ where: { builtIn: 'TEAM_MEMBER' } }),
  ]);
  if (!adminRole || !memberRole)
    throw new Error('Run the foundation seed before the sample seed');

  const outcomes = await db.callOutcome.findMany({ orderBy: { order: 'asc' } });
  const outcomeId = (labelEn: string): string => {
    const byLabel = outcomes.find((o) => o.labelEn === labelEn);
    if (byLabel) return byLabel.id;
    // An admin renamed it: fall back to an outcome setting the same status.
    const status = DEFAULT_CALL_OUTCOMES.find(
      (o) => o.labelEn === labelEn,
    )?.setsStatus;
    const same = outcomes.find((o) => o.setsStatus === status);
    if (!same) throw new Error(`No call outcome sets ${status}`);
    return same.id;
  };

  return db.$transaction(
    async (tx) => {
      // ---------------------------------------------------- accounts
      const teamLead = await tx.role.upsert({
        where: { name: TEAM_LEAD_ROLE.name },
        create: {
          name: TEAM_LEAD_ROLE.name,
          permissions: [...TEAM_LEAD_ROLE.permissions],
        },
        update: { permissions: [...TEAM_LEAD_ROLE.permissions] },
      });

      const accounts = [
        {
          key: 'admin',
          email: SAMPLE_ACCOUNTS.admin,
          name: 'Admin',
          roleId: adminRole.id,
          password: options.adminPassword,
          language: 'en' as const,
          active: true,
        },
        {
          key: 'sara',
          email: SAMPLE_ACCOUNTS.sara,
          name: 'Sara Mahmoud',
          roleId: memberRole.id,
          password: options.memberPassword,
          language: 'en' as const,
          active: true,
        },
        {
          key: 'omar',
          email: SAMPLE_ACCOUNTS.omar,
          name: 'عمر الشريف',
          roleId: memberRole.id,
          password: options.memberPassword,
          language: 'ar' as const,
          active: true,
        },
        {
          key: 'lead',
          email: SAMPLE_ACCOUNTS.lead,
          name: 'Layla Hassan',
          roleId: teamLead.id,
          password: options.memberPassword,
          language: 'en' as const,
          active: true,
        },
        {
          key: 'karim',
          email: SAMPLE_ACCOUNTS.deactivated,
          name: 'Karim Fawzy',
          roleId: memberRole.id,
          password: options.memberPassword,
          language: 'ar' as const,
          active: false,
        },
      ];
      const userIds: Record<string, string> = {};
      const deactivatedAt = at(-10 * DAY);
      for (const a of accounts) {
        const existing = await tx.user.findUnique({
          where: { email: a.email },
        });
        // Keep the stored hash when it already matches, so a re-seed rewrites nothing.
        const passwordHash =
          existing && (await verifyPassword(a.password, existing.passwordHash))
            ? existing.passwordHash
            : await hashPassword(a.password);
        const fields = {
          roleId: a.roleId,
          language: a.language,
          active: a.active,
          deactivatedAt: a.active ? null : deactivatedAt,
          passwordHash,
        };
        const user = await tx.user.upsert({
          where: { email: a.email },
          create: { email: a.email, name: a.name, ...fields },
          // The admin may be the foundation's first admin: keep the name it was given.
          update: a.key === 'admin' ? fields : { name: a.name, ...fields },
        });
        userIds[a.key] = user.id;
      }
      const admin = userIds.admin;
      const memberOf = (who: Who) => (who ? userIds[who] : null);

      const rows: Rows = {
        owners: [],
        phones: [],
        assignments: [],
        calls: [],
        listings: [],
        photos: [],
        reminders: [],
        notes: [],
        importRows: [],
        activity: [],
      };

      // ---------------------------------------------------- import job
      const importId = sampleId('import', 'owners-batch-1');
      const importAt = at(-20 * DAY);
      const importJob = {
        id: importId,
        kind: 'OWNERS' as const,
        fileName: 'owners-new-cairo-batch-1.xlsx',
        status: 'DONE' as const,
        headers: ['Name', 'Phone', 'Area', 'Notes'],
        mapping: { name: 'Name', phone: 'Phone', area: 'Area' },
        assignToId: userIds.sara,
        totalRows: 15,
        addedCount: IMPORTED_COUNT,
        duplicateCount: 2,
        rejectedCount: 1,
        error: null,
        createdById: admin,
        createdAt: importAt,
      };
      await tx.importJob.upsert({
        where: { id: importId },
        create: importJob,
        update: importJob,
      });

      // ---------------------------------------------------- owners
      const owners = planOwners(now);
      const listedOwners = owners.filter((o) => o.status === 'LISTED');

      for (const o of owners) {
        const member = memberOf(o.assignee);
        const area =
          o.n % 11 === 0 ? null : SAMPLE_AREAS[o.n % SAMPLE_AREAS.length];
        o.phones.forEach((phone, position) =>
          rows.phones.push({
            id: sampleId('phone', `${o.n}-${position}`),
            ownerId: o.id,
            phone,
            position,
            createdAt: o.createdAt,
          }),
        );

        // Assignment history: to the first member at creation (or at import), then the
        // deactivated member's hand-over 10 days ago.
        const firstMember = o.karimHistory ? userIds.karim : member;
        if (firstMember)
          rows.assignments.push({
            id: sampleId('assign', `${o.n}-0`),
            ownerId: o.id,
            fromMemberId: null,
            toMemberId: firstMember,
            byId: admin,
            createdAt: at(o.createdAt.getTime() - now.getTime() + HOUR),
          });
        if (o.karimHistory)
          rows.assignments.push({
            id: sampleId('assign', `${o.n}-1`),
            ownerId: o.id,
            fromMemberId: userIds.karim,
            toMemberId: member,
            byId: admin,
            createdAt: deactivatedAt,
          });

        // Calls: the final outcome sets the status; some owners had an earlier "No answer".
        const ownerCalls: { at: Date; label: string | null; by: string }[] = [];
        if (o.status !== 'NEW') {
          const labels = FINAL_OUTCOMES[o.status];
          const finalLabel = labels[o.k % labels.length];
          const daysAgo =
            o.status === 'LISTED'
              ? 14 + 2 * o.k
              : o.karimHistory && !member
                ? 12
                : (o.n * 3) % 11;
          const finalAt = at(-daysAgo * DAY - ((o.n % 5) + 1) * HOUR);
          const by =
            o.karimHistory && !member ? userIds.karim : (member ?? admin);
          if (o.karimHistory)
            ownerCalls.push({
              at: at(-14 * DAY - 2 * HOUR),
              label: 'No answer',
              by: userIds.karim,
            });
          if (o.k % 2 === 0 && o.status !== 'CONTACTED')
            ownerCalls.push({
              at: new Date(finalAt.getTime() - 3 * DAY),
              label: 'No answer',
              by,
            });
          ownerCalls.push({ at: finalAt, label: finalLabel, by });
          if (o.missingOutcome)
            ownerCalls.push({ at: at(-40 * MINUTE), label: null, by });
        }
        ownerCalls.sort((a, b) => a.at.getTime() - b.at.getTime());
        ownerCalls.forEach((c, j) => {
          const note =
            j % 3 === 2
              ? o.n % 2
                ? NOTES_AR[o.n % 5]
                : NOTES_EN[o.n % 5]
              : null;
          rows.calls.push({
            id: sampleId('call', `${o.n}-${j}`),
            ownerId: o.id,
            ownerName: o.name,
            memberId: c.by,
            phone: o.phones[0],
            clientRequestId: sampleId('call-request', `${o.n}-${j}`),
            startedAt: c.at,
            outcomeId: c.label ? outcomeId(c.label) : null,
            note: c.label ? note : null,
            outcomeAt: c.label ? new Date(c.at.getTime() + 3 * MINUTE) : null,
            createdAt: c.at,
          });
        });

        rows.owners.push({
          id: o.id,
          name: o.name,
          area,
          status: o.status,
          assignedToId: member,
          sourceImportId: o.imported ? importId : null,
          lastCallAt: ownerCalls.at(-1)?.at ?? null,
          createdById: admin,
          createdAt: o.createdAt,
          deletedAt: null,
          deletedById: null,
        });

        // Reminders: overdue / due today / upcoming / done, and one unassigned open reminder.
        const reminder = (
          key: string,
          dueAt: Date,
          doneAt: Date | null,
          note: string | null,
        ) =>
          rows.reminders.push({
            id: sampleId('reminder', `${o.n}-${key}`),
            kind: 'MANUAL',
            ownerId: o.id,
            listingId: null,
            memberId: member,
            dueAt,
            note,
            doneAt,
            createdById: member ?? admin,
            createdAt: o.createdAt,
          });
        if (o.status === 'CALL_BACK') {
          const slot = o.k % 3;
          if (o.k === 6)
            reminder(
              'a',
              at(-4 * DAY),
              at(-4 * DAY + HOUR),
              'Called back as promised.',
            );
          else if (slot === 0)
            reminder(
              'a',
              at(-1 * DAY - 2 * HOUR),
              null,
              'Call back about the price.',
            );
          else if (slot === 1)
            reminder('a', dueToday, null, 'اتصل به بخصوص السعر.');
          else
            reminder(
              'a',
              at(2 * DAY),
              null,
              'Owner asked for a call after the weekend.',
            );
        }
        if (o.status === 'CONTACTED' && member) {
          if (o.k % 4 === 1)
            reminder('a', at(4 * DAY), null, 'Try again in the evening.');
          if (o.k % 4 === 2)
            reminder(
              'a',
              at(-3 * DAY),
              at(-3 * DAY + 2 * HOUR),
              'حاول مرة أخرى مساءً.',
            );
        }
        if (o.status === 'CONTACTED' && !member)
          reminder('a', at(1 * DAY), null, 'Follow up once reassigned.');
        if (o.status === 'INTERESTED') {
          if (o.k % 3 === 0)
            reminder(
              'a',
              at(-2 * DAY),
              at(-2 * DAY + HOUR),
              'Sent the valuation.',
            );
          if (o.k % 3 === 1)
            reminder('a', at(-3 * HOUR), null, 'ارسل له تقييم الشقة.');
        }

        if (o.n % 3 === 0) {
          rows.notes.push({
            id: sampleId('note', `owner-${o.n}`),
            ownerId: o.id,
            listingId: null,
            authorId: member ?? admin,
            body:
              o.n % 2 === 1
                ? NOTES_AR[o.n % NOTES_AR.length]
                : NOTES_EN[o.n % NOTES_EN.length],
            createdAt: at(o.createdAt.getTime() - now.getTime() + DAY),
          });
        }
      }

      // The trashed owner (deleted 5 days ago): keeps its phone, its open reminder was closed.
      const trashedOwnerId = sampleId('owner', TRASHED_OWNER_N);
      const deletedAt = at(-5 * DAY);
      rows.owners.push({
        id: trashedOwnerId,
        name: 'Hany Ragab',
        area: 'Maadi',
        status: 'NOT_INTERESTED',
        assignedToId: null,
        sourceImportId: null,
        lastCallAt: null,
        createdById: admin,
        createdAt: at(-40 * DAY),
        deletedAt,
        deletedById: admin,
      });
      rows.phones.push({
        id: sampleId('phone', `${TRASHED_OWNER_N}-0`),
        ownerId: trashedOwnerId,
        phone: ownerPhone(TRASHED_OWNER_N, 0),
        position: 0,
        createdAt: at(-40 * DAY),
      });
      rows.reminders.push({
        id: sampleId('reminder', `${TRASHED_OWNER_N}-a`),
        kind: 'MANUAL',
        ownerId: trashedOwnerId,
        listingId: null,
        memberId: null,
        dueAt: at(-2 * DAY),
        note: 'Closed when the owner was deleted.',
        doneAt: deletedAt,
        createdById: admin,
        createdAt: at(-40 * DAY),
      });

      // ---------------------------------------------------- listings
      for (const l of LISTINGS) {
        const id = sampleId('listing', l.n);
        const owner =
          l.listedOwner !== undefined ? listedOwners[l.listedOwner] : undefined;
        const assigneeId = owner
          ? memberOf(owner.assignee)
          : memberOf(l.direct?.assignee ?? null);
        const createdAt = owner
          ? new Date(
              (
                rows.owners.find((r) => r.id === owner.id)?.lastCallAt as Date
              ).getTime() + DAY,
            )
          : at(-(40 - l.n) * DAY);
        const posted = new Date(createdAt.getTime() + DAY);
        const ad: Pick<
          Prisma.ListingCreateManyInput,
          | 'adLink'
          | 'adStatus'
          | 'adPostedAt'
          | 'adTakenDownAt'
          | 'lastCheckInAt'
        > = {
          adLink: null,
          adStatus: 'NOT_POSTED',
          adPostedAt: null,
          adTakenDownAt: null,
          lastCheckInAt: null,
        };
        const link = `https://www.propertyfinder.eg/en/plp/sample-listing-${l.n}.html`;
        const task = (
          key: string,
          kind: ReminderKind,
          dueAt: Date,
          doneAt: Date | null,
        ) =>
          rows.reminders.push({
            id: sampleId('reminder', `listing-${l.n}-${key}`),
            kind,
            ownerId: null,
            listingId: id,
            memberId: assigneeId,
            dueAt,
            note: null,
            doneAt,
            createdById: null,
            createdAt: posted,
          });
        switch (l.ad) {
          case 'liveDue': // check-in overdue: last check-in 9 days ago, interval 7
            Object.assign(ad, {
              adLink: link,
              adStatus: 'LIVE',
              adPostedAt: posted,
              lastCheckInAt: at(-9 * DAY),
            });
            task('checkin-1', 'AD_CHECK_IN', at(-9 * DAY), at(-9 * DAY));
            task('checkin-2', 'AD_CHECK_IN', at(-2 * DAY), null);
            break;
          case 'liveFine':
            Object.assign(ad, {
              adLink: link,
              adStatus: 'LIVE',
              adPostedAt: posted,
              lastCheckInAt: at(-2 * DAY),
            });
            task('checkin-1', 'AD_CHECK_IN', at(-2 * DAY), at(-2 * DAY));
            task('checkin-2', 'AD_CHECK_IN', at(5 * DAY), null);
            break;
          case 'takeDownOpen': // sold while the ad is live: the take-down task stays open
            Object.assign(ad, {
              adLink: link,
              adStatus: 'LIVE',
              adPostedAt: posted,
              lastCheckInAt: at(-6 * DAY),
            });
            task('takedown', 'AD_TAKE_DOWN', at(-1 * DAY), null);
            break;
          case 'takenDown':
            Object.assign(ad, {
              adLink: link,
              adStatus: 'TAKEN_DOWN',
              adPostedAt: posted,
              lastCheckInAt: at(-10 * DAY),
              adTakenDownAt: at(-3 * DAY),
            });
            task('takedown', 'AD_TAKE_DOWN', at(-4 * DAY), at(-3 * DAY));
            break;
          case 'notPosted':
            break;
        }
        rows.listings.push({
          id,
          purpose: l.purpose,
          type: l.type,
          area: l.area,
          compound: l.compound ?? null,
          address: l.address ?? null,
          sizeSqm: l.sizeSqm,
          floor: l.floor ?? null,
          bedrooms: l.bedrooms ?? null,
          bathrooms: l.bathrooms ?? null,
          price: l.price,
          furnishing: l.furnishing ?? null,
          description: l.description ?? null,
          ownerName: owner ? owner.name : (l.direct?.name ?? ''),
          ownerPhone: owner ? owner.phones[0] : directListingPhone(l.n),
          ownerId: owner ? owner.id : null,
          assignedToId: assigneeId,
          status: l.status,
          ...ad,
          sourceImportId: null,
          createdById: owner ? (assigneeId ?? admin) : admin,
          createdAt,
          deletedAt: l.trashed ? deletedAt : null,
          deletedById: l.trashed ? admin : null,
        });
        for (let k = 1; k <= l.photos; k++)
          rows.photos.push({
            id: sampleId('photo', `${l.n}-${k}`),
            listingId: id,
            url: `https://placehold.co/1200x800/png?text=Listing+${l.n}+%23${k}`,
            pathname: `sample/listings/${l.n}/${k}.png`,
            order: k - 1,
            createdAt,
            deletedAt: null,
            deletedById: null,
          });
        if (l.n % 5 === 1 || l.n === 4 || l.n === 14)
          rows.notes.push({
            id: sampleId('note', `listing-${l.n}`),
            ownerId: null,
            listingId: id,
            authorId: assigneeId ?? admin,
            body:
              l.n % 2
                ? 'Owner keeps the keys with the doorman.'
                : 'المالك موجود يوميًا بعد العصر للمعاينة.',
            createdAt: posted,
          });
      }
      // A trashed photo on the first listing.
      rows.photos.push({
        id: sampleId('photo', '1-trashed'),
        listingId: sampleId('listing', 1),
        url: 'https://placehold.co/1200x800/png?text=Listing+1+old',
        pathname: 'sample/listings/1/old.png',
        order: 3,
        createdAt: at(-12 * DAY),
        deletedAt,
        deletedById: userIds.sara,
      });

      // ---------------------------------------------------- import rows
      const imported = owners.filter((o) => o.imported);
      const issueRows = new Map<
        number,
        Omit<
          WithId<Prisma.ImportRowCreateManyInput>,
          'id' | 'jobId' | 'rowNumber'
        >
      >([
        [
          4,
          {
            data: {
              Name: owners[19].name,
              Phone: localFormat(owners[19].phones[0]),
              Area: 'New Cairo',
            },
            issue: 'DUPLICATE',
            issueField: 'phone',
            issueValue: localFormat(owners[19].phones[0]),
            matchOwnerId: owners[19].id,
            matchListingId: null,
          },
        ],
        [
          9,
          {
            data: {
              Name: 'شركة النيل للاستثمار',
              Phone: localFormat(directListingPhone(10)),
              Area: 'Fifth Settlement',
            },
            issue: 'DUPLICATE',
            issueField: 'phone',
            issueValue: localFormat(directListingPhone(10)),
            matchOwnerId: null,
            matchListingId: sampleId('listing', 10),
          },
        ],
        [
          13,
          {
            data: { Name: 'Unknown', Phone: '01234', Area: '' },
            issue: 'INVALID_PHONE',
            issueField: 'phone',
            issueValue: '01234',
            matchOwnerId: null,
            matchListingId: null,
          },
        ],
      ]);
      let next = 0;
      for (let rowNumber = 1; rowNumber <= importJob.totalRows; rowNumber++) {
        const issue = issueRows.get(rowNumber);
        const base = {
          id: sampleId('import-row', rowNumber),
          jobId: importId,
          rowNumber,
        };
        if (issue) {
          rows.importRows.push({ ...base, ...issue });
        } else {
          const o = imported[next++];
          rows.importRows.push({
            ...base,
            data: {
              Name: o.name,
              Phone: localFormat(o.phones[0]),
              Area: SAMPLE_AREAS[o.n % SAMPLE_AREAS.length],
            },
            issue: null,
            issueField: null,
            issueValue: null,
            matchOwnerId: null,
            matchListingId: null,
          });
        }
      }

      // ---------------------------------------------------- activity log
      const act = (
        key: string,
        entry: Omit<WithId<Prisma.ActivityEntryCreateManyInput>, 'id'>,
      ) => rows.activity.push({ id: sampleId('activity', key), ...entry });
      for (const a of accounts.filter((x) => x.key !== 'admin'))
        act(`user-create-${a.key}`, {
          type: 'USER_CREATE',
          actorId: admin,
          summary: `Created user ${a.name}`,
          targetKind: 'USER',
          targetId: userIds[a.key],
          targetLabel: a.name,
          details: { email: a.email },
          createdAt: at(-45 * DAY),
        });
      act('role-create-team-lead', {
        type: 'ROLE_CREATE',
        actorId: admin,
        summary: `Created role ${TEAM_LEAD_ROLE.name}`,
        targetKind: 'ROLE',
        targetId: teamLead.id,
        targetLabel: TEAM_LEAD_ROLE.name,
        details: { permissions: [...TEAM_LEAD_ROLE.permissions] },
        createdAt: at(-44 * DAY),
      });
      act('import-owners-batch-1', {
        type: 'IMPORT',
        actorId: admin,
        summary: `Imported ${importJob.fileName}`,
        targetKind: 'IMPORT',
        targetId: importId,
        targetLabel: importJob.fileName,
        details: { added: 12, duplicates: 2, rejected: 1 },
        createdAt: importAt,
      });
      act('assign-import', {
        type: 'ASSIGN',
        actorId: admin,
        summary: `Assigned ${IMPORTED_COUNT} owners to Sara Mahmoud`,
        targetKind: 'USER',
        targetId: userIds.sara,
        targetLabel: 'Sara Mahmoud',
        details: { count: IMPORTED_COUNT, to: userIds.sara },
        createdAt: importAt,
      });
      act('user-deactivate-karim', {
        type: 'USER_DEACTIVATE',
        actorId: admin,
        summary: 'Deactivated Karim Fawzy',
        targetKind: 'USER',
        targetId: userIds.karim,
        targetLabel: 'Karim Fawzy',
        details: { handedTo: userIds.omar },
        createdAt: deactivatedAt,
      });
      act('assign-handover-karim', {
        type: 'ASSIGN',
        actorId: admin,
        summary: "Moved Karim Fawzy's owners",
        targetKind: 'USER',
        targetId: userIds.karim,
        targetLabel: 'Karim Fawzy',
        details: {
          count: owners.filter((o) => o.karimHistory).length,
          from: userIds.karim,
        },
        createdAt: deactivatedAt,
      });
      act('delete-owner', {
        type: 'DELETE',
        actorId: admin,
        summary: 'Deleted owner Hany Ragab',
        targetKind: 'OWNER',
        targetId: trashedOwnerId,
        targetLabel: 'Hany Ragab',
        createdAt: deletedAt,
      });
      act('delete-listing', {
        type: 'DELETE',
        actorId: admin,
        summary: 'Deleted listing 20',
        targetKind: 'LISTING',
        targetId: sampleId('listing', 20),
        targetLabel: 'Apartment · 3 bd · Madinaty',
        createdAt: deletedAt,
      });
      act('export-owners', {
        type: 'EXPORT',
        actorId: admin,
        summary: 'Exported owners',
        targetKind: null,
        targetId: null,
        targetLabel: null,
        details: { kind: 'owners', rows: owners.length },
        createdAt: at(-2 * DAY),
      });

      // ---------------------------------------------------- write
      for (const r of rows.owners)
        await tx.owner.upsert({ where: { id: r.id }, create: r, update: r });
      for (const r of rows.phones)
        await tx.ownerPhone.upsert({
          where: { id: r.id },
          create: r,
          update: r,
        });
      for (const r of rows.assignments)
        await tx.ownerAssignment.upsert({
          where: { id: r.id },
          create: r,
          update: r,
        });
      for (const r of rows.calls)
        await tx.call.upsert({ where: { id: r.id }, create: r, update: r });
      for (const r of rows.listings)
        await tx.listing.upsert({ where: { id: r.id }, create: r, update: r });
      for (const r of rows.photos)
        await tx.photo.upsert({ where: { id: r.id }, create: r, update: r });
      for (const r of rows.reminders)
        await tx.reminder.upsert({ where: { id: r.id }, create: r, update: r });
      for (const r of rows.notes)
        await tx.note.upsert({ where: { id: r.id }, create: r, update: r });
      for (const r of rows.importRows)
        await tx.importRow.upsert({
          where: { id: r.id },
          create: r,
          update: r,
        });
      for (const r of rows.activity)
        await tx.activityEntry.upsert({
          where: { id: r.id },
          create: r,
          update: r,
        });

      return {
        users: accounts.length,
        owners: rows.owners.length,
        phones: rows.phones.length,
        calls: rows.calls.length,
        reminders: rows.reminders.length,
        notes: rows.notes.length,
        listings: rows.listings.length,
        photos: rows.photos.length,
        importRows: rows.importRows.length,
        activity: rows.activity.length,
      };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
