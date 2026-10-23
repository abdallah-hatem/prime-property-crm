'use client';

import { useId, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  LeadStatusSchema,
  SEARCH_MAX_LENGTH,
  type UserSummary,
} from '@prime-crm/shared';
import { FilterChips } from '@/components/filter-chips';
import type { OwnerFilters } from '@/components/owners-admin/owner-filters';
import { SearchField } from '@/components/search-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/i18n/i18n-provider';
import { cn } from '@/lib/utils';
import type { ParamUpdates } from '@/lib/use-url-params';

/** Radix Select can't hold '' — this stands for "no filter". */
const ANY = 'any';

export interface FilterOption {
  value: string;
  label: string;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  options: readonly FilterOption[];
  onChange: (value: string) => void;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <bdi>{option.label}</bdi>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * The admin table's filters: search, status pills, then who it's assigned to, area, import,
 * reminder and sort. Every change goes to the URL through `onChange` (no scroll).
 */
export function OwnersFilters({
  filters,
  members,
  areas,
  imports,
  pending,
  onChange,
}: {
  filters: OwnerFilters;
  members: readonly UserSummary[];
  areas: readonly string[];
  /** Past owner imports to filter by; empty hides the filter. */
  imports: readonly FilterOption[];
  pending: boolean;
  onChange: (updates: ParamUpdates) => void;
}) {
  const { t } = useTranslation();
  const set = (key: string) => (value: string) =>
    onChange({ [key]: value === ANY ? null : value });

  const statusOptions = [
    { value: ANY, label: t('owners.all') },
    ...LeadStatusSchema.options.map((value) => ({
      value,
      label: t(`leadStatus.${value}`),
    })),
  ];
  const assignedOptions: FilterOption[] = [
    { value: ANY, label: t('ownersAdmin.anyone') },
    { value: 'unassigned', label: t('owners.unassigned') },
    ...members.map((user) => ({ value: user.id, label: user.name })),
  ];
  // The current area stays choosable even when the lookup page doesn't hold it.
  const areaValues =
    filters.area && !areas.includes(filters.area)
      ? [filters.area, ...areas]
      : areas;
  const areaOptions: FilterOption[] = [
    { value: ANY, label: t('ownersAdmin.anyArea') },
    ...areaValues.map((area) => ({ value: area, label: area })),
  ];
  const importOptions: FilterOption[] = [
    { value: ANY, label: t('ownersAdmin.anyImport') },
    ...imports,
  ];
  const reminderOptions: FilterOption[] = [
    { value: ANY, label: t('ownersAdmin.reminderAny') },
    { value: 'true', label: t('ownersAdmin.reminderYes') },
    { value: 'false', label: t('ownersAdmin.reminderNo') },
  ];
  const sortOptions: FilterOption[] = [
    { value: ANY, label: t('ownersAdmin.sortCreated') },
    { value: 'lastCall', label: t('ownersAdmin.sortLastCall') },
    { value: 'name', label: t('ownersAdmin.sortName') },
  ];
  const active = [
    filters.assignedTo,
    filters.area,
    filters.importId,
    filters.hasReminder,
    filters.sort,
  ].filter((value) => value !== undefined).length;
  const narrowed = active - (filters.sort ? 1 : 0) > 0;
  // Phones: the pickers fold behind one button so the list starts on the first screen.
  const [open, setOpen] = useState(false);
  const pickersId = useId();

  return (
    <div className="grid grid-cols-1 gap-3">
      <SearchField
        label={t('owners.searchLabel')}
        placeholder={t('owners.searchPlaceholder')}
        value={filters.q}
        maxLength={SEARCH_MAX_LENGTH}
        pending={pending}
        onSearch={(q) => onChange({ q })}
      />
      <FilterChips
        label={t('owners.statusFilter')}
        options={statusOptions}
        value={filters.status ?? ANY}
        onChange={set('status')}
      />
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 md:order-last',
          !narrowed && 'md:hidden',
        )}
      >
        <Button
          variant="outline"
          size="sm"
          className="md:hidden"
          aria-expanded={open}
          aria-controls={pickersId}
          onClick={() => setOpen((value) => !value)}
          data-testid="toggle-filters"
        >
          <SlidersHorizontal aria-hidden />
          {active > 0
            ? t('ownersAdmin.filtersActive', { count: active })
            : t('ownersAdmin.filters')}
        </Button>
        {narrowed && (
          <Button
            variant="link"
            size="sm"
            className="h-9"
            onClick={() =>
              onChange({
                assignedTo: null,
                area: null,
                importId: null,
                hasReminder: null,
              })
            }
          >
            {t('ownersAdmin.clearFilters')}
          </Button>
        )}
      </div>
      <div
        id={pickersId}
        className={cn(
          'grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 md:grid lg:grid-cols-5',
          open ? 'grid' : 'hidden',
        )}
      >
        <FilterSelect
          label={t('owners.assignedTo')}
          value={filters.assignedTo ?? ANY}
          options={assignedOptions}
          onChange={set('assignedTo')}
          testId="filter-assigned"
        />
        <FilterSelect
          label={t('owners.area')}
          value={filters.area ?? ANY}
          options={areaOptions}
          onChange={set('area')}
        />
        {imports.length > 0 && (
          <FilterSelect
            label={t('ownersAdmin.importFilter')}
            value={filters.importId ?? ANY}
            options={importOptions}
            onChange={set('importId')}
          />
        )}
        <FilterSelect
          label={t('ownersAdmin.reminderFilter')}
          value={
            filters.hasReminder === undefined
              ? ANY
              : String(filters.hasReminder)
          }
          options={reminderOptions}
          onChange={set('hasReminder')}
        />
        <FilterSelect
          label={t('ownersAdmin.sort')}
          value={filters.sort ?? ANY}
          options={sortOptions}
          onChange={set('sort')}
        />
      </div>
    </div>
  );
}
