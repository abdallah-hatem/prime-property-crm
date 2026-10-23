'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus, ShieldCheck, UsersRound } from 'lucide-react';
import type { Role } from '@prime-crm/shared';
import { DELETE_ROLE } from '@/apis';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { UserText } from '@/components/user-text';
import { callApi } from '@/lib/callApi';
import { formatNumber } from '@/lib/format';
import { PERMISSION_COUNT, permissionLabel } from './permission-groups';
import { RoleEditorDialog } from './role-editor-dialog';

const PREVIEW = 3;

/** Roles with how many users hold each and what they may do; a card opens the editor. */
export function RolesView({ roles }: { roles: Role[] }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  return (
    <div className="grid grid-cols-1 gap-5" data-testid="roles-page">
      <PageHeader
        title={t('nav.roles')}
        actions={
          <Button onClick={() => setEditing('new')} data-testid="add-role">
            <Plus aria-hidden />
            {t('admin.roles.add')}
          </Button>
        }
      />
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => {
          const count = role.permissions.length;
          return (
            <li key={role.id}>
              <button
                type="button"
                onClick={() => setEditing(role)}
                data-testid="role-card"
                className="grid h-full w-full cursor-pointer content-start gap-4 rounded-lg bg-card p-5 text-start shadow-raised transition-colors duration-150 hover:bg-accent/50"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="grid min-w-0 gap-1.5">
                    <span className="truncate type-h2">
                      <UserText>{role.name}</UserText>
                    </span>
                    {role.builtIn && (
                      <Badge variant="neutral" dot="none">
                        <ShieldCheck aria-hidden />
                        {t('admin.builtIn')}
                      </Badge>
                    )}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="mt-1 size-5 shrink-0 flip-rtl text-muted-foreground"
                  />
                </span>
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <UsersRound
                      aria-hidden
                      className="size-4 text-muted-foreground"
                    />
                    <span className="sr-only">{t('admin.roles.users')}</span>
                    <span className="font-numeric tabular-nums">
                      {formatNumber(role.userCount)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {t('admin.roles.permissionsCount', {
                      count: formatNumber(count),
                      total: formatNumber(PERMISSION_COUNT),
                    })}
                  </span>
                </span>
                {count === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    {t('admin.roles.noPermissions')}
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {role.permissions.slice(0, PREVIEW).map((key) => (
                      <Badge key={key} variant="primary" dot="none">
                        {permissionLabel(key, locale)}
                      </Badge>
                    ))}
                    {count > PREVIEW && (
                      <Badge variant="neutral" dot="none">
                        <bdi className="font-numeric">
                          +{formatNumber(count - PREVIEW)}
                        </bdi>
                      </Badge>
                    )}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <RoleEditorDialog
        role={editing === 'new' ? null : editing}
        open={editing !== null}
        onOpenChange={(next) => !next && setEditing(null)}
        onDelete={(role) => {
          setEditing(null);
          setDeleting(role);
        }}
      />
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setDeleting(null)}
          title={t('admin.roles.deleteTitle', { name: deleting.name })}
          description={t('admin.roles.deleteBody')}
          confirmLabel={t('admin.roles.delete')}
          destructive
          onConfirm={async () => {
            const res = await callApi(DELETE_ROLE(deleting.id), {
              showSuccessToast: true,
              successMessage: t('admin.roles.deleted'),
            });
            if (!res.success) return false;
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
