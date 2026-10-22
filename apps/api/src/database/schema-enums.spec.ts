import { $Enums } from '@prisma/client';
import {
  ActivityTypeSchema,
  AdStatusSchema,
  BuiltInRoleSchema,
  FurnishingSchema,
  ImportIssueReasonSchema,
  ImportKindSchema,
  ImportStatusSchema,
  LanguageSchema,
  LeadStatusSchema,
  ListingPurposeSchema,
  ListingStatusSchema,
  PropertyTypeSchema,
  ReminderKindSchema,
} from '@prime-crm/shared';

// The Prisma enums are a second spelling of the contract enums in packages/shared.
// This fails the moment the two drift.
describe('Prisma enums match the shared contract', () => {
  const pairs: [string, Record<string, string>, readonly string[]][] = [
    ['LeadStatus', $Enums.LeadStatus, LeadStatusSchema.options],
    ['ListingPurpose', $Enums.ListingPurpose, ListingPurposeSchema.options],
    ['ListingStatus', $Enums.ListingStatus, ListingStatusSchema.options],
    ['PropertyType', $Enums.PropertyType, PropertyTypeSchema.options],
    ['Furnishing', $Enums.Furnishing, FurnishingSchema.options],
    ['AdStatus', $Enums.AdStatus, AdStatusSchema.options],
    ['ReminderKind', $Enums.ReminderKind, ReminderKindSchema.options],
    ['Language', $Enums.Language, LanguageSchema.options],
    ['ActivityType', $Enums.ActivityType, ActivityTypeSchema.options],
    ['BuiltInRole', $Enums.BuiltInRole, BuiltInRoleSchema.options],
    ['ImportKind', $Enums.ImportKind, ImportKindSchema.options],
    ['ImportStatus', $Enums.ImportStatus, ImportStatusSchema.options],
    [
      'ImportIssueReason',
      $Enums.ImportIssueReason,
      ImportIssueReasonSchema.options,
    ],
  ];

  it.each(pairs)('%s', (_name, prismaEnum, shared) => {
    expect(Object.values(prismaEnum)).toEqual([...shared]);
  });
});
