import { GET_ROLES } from '@/apis';
import { RolesView } from '@/components/admin/roles/roles-view';
import { LoadError } from '@/components/load-error';
import { getTranslator } from '@/i18n/server';

/** Roles (roles.manage): the list with user counts; the editor opens over it. */
export default async function RolesPage() {
  const res = await GET_ROLES();
  if (!res.success) {
    const t = await getTranslator();
    return <LoadError title={t('nav.roles')} message={t('error.generic')} />;
  }
  return <RolesView roles={res.data} />;
}
