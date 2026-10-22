import {
  Activity,
  Building,
  CalendarCheck,
  ChartColumn,
  Contact,
  FileUp,
  LayoutGrid,
  Settings,
  ShieldCheck,
  Trash,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import type { NavIcon } from '@/lib/routes';

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  today: CalendarCheck,
  owners: Contact,
  listings: Building,
  more: LayoutGrid,
  users: UserCog,
  roles: ShieldCheck,
  imports: FileUp,
  analytics: ChartColumn,
  trash: Trash,
  activity: Activity,
  settings: Settings,
};
