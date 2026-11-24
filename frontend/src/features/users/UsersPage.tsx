import { Avatar, Box, Button, Card, Chip, IconButton, Menu, MenuItem, Skeleton, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { KeyRound, Lock, LockOpen, MoreVertical, Pencil, Plus, Power, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { AppUser, RoleDto } from '@/api/adminTypes';
import { usersApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { ConfirmDialog } from '@/components/common/Dialogs';
import { IconTile } from '@/components/common/IconTile';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState } from '@/components/common/States';
import { DataTable, type Column } from '@/components/data/DataTable';
import { SearchToolbar } from '@/components/data/SearchToolbar';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useListState } from '@/hooks/useListState';
import { useAuthStore } from '@/stores/auth';
import { brand, chartColors } from '@/theme/theme';
import { initials, timeAgo } from '@/utils/format';
import { ActiveBadge } from '../shared/Badges';
import { PasswordResetDialog, RoleEditorDialog, UserFormDialog } from './UserDialogs';

function UsersTab({ roles, canManage }: { roles: RoleDto[]; canManage: boolean }) {
  const me = useAuthStore((s) => s.user);
  const list = useListState({ sort: 'name', order: 'asc', status: 'all' });
  const q = useQuery({ queryKey: ['users', list.params], queryFn: () => usersApi.list(list.params), placeholderData: (p) => p });
  const [editing, setEditing] = useState<AppUser | null | 'new'>(null);
  const [menu, setMenu] = useState<{ el: HTMLElement; user: AppUser } | null>(null);
  const [resetting, setResetting] = useState<AppUser | null>(null);
  const [toggling, setToggling] = useState<AppUser | null>(null);

  const unlock = useApiMutation((u: AppUser) => usersApi.unlock(u.id), { success: 'Account unlocked', invalidate: [['users']] });
  const toggle = useApiMutation((u: AppUser) => usersApi.update(u.id, { isActive: !u.isActive }), {
    success: (u) => (u.isActive ? 'User activated' : 'User deactivated and signed out'),
    invalidate: [['users']],
    onSuccess: () => setToggling(null),
  });

  const columns: Column<AppUser>[] = [
    {
      key: 'name',
      header: 'User',
      sortKey: 'name',
      render: (u) => (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Avatar sx={{ width: 38, height: 38, fontSize: 14, fontWeight: 700, bgcolor: chartColors[u.email.length % chartColors.length] }}>{initials(u.fullName)}</Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>
              {u.fullName} {u.email === me?.email && <Chip size="small" label="You" sx={{ height: 18, ml: 0.5 }} />}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {u.email}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (u) => (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
          {u.roles.map((r) => (
            <Chip key={r.code} size="small" label={r.name} color={r.code === 'SUPER_ADMIN' ? 'secondary' : 'default'} variant={r.code === 'SUPER_ADMIN' ? 'filled' : 'outlined'} />
          ))}
        </Stack>
      ),
    },
    { key: 'access', header: 'Company access', hideBelow: 'md', render: (u) => (u.companyScope === 'ALL' ? 'All companies' : u.companies.length ? u.companies.map((c) => c.name).join(', ') : 'None') },
    { key: 'login', header: 'Last sign-in', sortKey: 'lastLoginAt', hideBelow: 'sm', render: (u) => timeAgo(u.lastLoginAt) },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (u.lockedUntil ? <Chip size="small" color="warning" icon={<Lock size={13} />} label="Locked" /> : <ActiveBadge active={u.isActive} />),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (u: AppUser) => (
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); setMenu({ el: e.currentTarget, user: u }); }} aria-label={`Actions for ${u.fullName}`}>
                <MoreVertical size={17} />
              </IconButton>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        plain
        columns={columns}
        rows={q.data?.items}
        rowKey={(u) => u.id}
        loading={q.isFetching}
        error={q.error ? toApiError(q.error).message : null}
        onRetry={() => void q.refetch()}
        meta={q.data?.meta}
        onPageChange={list.setPage}
        sort={{ key: list.params.sort, order: list.params.order ?? 'asc' }}
        onSortChange={list.setSort}
        onRowClick={canManage ? (u) => setEditing(u) : undefined}
        emptyTitle="No users match"
        toolbar={
          <SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search name or email">
            <TextField select size="small" label="Status" value={list.params.status} onChange={(e) => list.set({ status: e.target.value })} sx={{ minWidth: 140 }}>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
              <MenuItem value="locked">Locked</MenuItem>
            </TextField>
            <TextField select size="small" label="Role" value={(list.params.role as string) ?? ''} onChange={(e) => list.set({ role: e.target.value || undefined })} sx={{ minWidth: 170 }}>
              <MenuItem value="">All roles</MenuItem>
              {roles.map((r) => (
                <MenuItem key={r.code} value={r.code}>
                  {r.name}
                </MenuItem>
              ))}
            </TextField>
            {canManage && (
              <Button variant="contained" startIcon={<Plus size={17} />} onClick={() => setEditing('new')}>
                Add user
              </Button>
            )}
          </SearchToolbar>
        }
      />
      <Menu anchorEl={menu?.el} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { setEditing(menu!.user); setMenu(null); }} sx={{ gap: 1.25 }}>
          <Pencil size={16} /> Edit
        </MenuItem>
        {menu?.user.lockedUntil && (
          <MenuItem onClick={() => { unlock.mutate(menu.user); setMenu(null); }} sx={{ gap: 1.25 }}>
            <LockOpen size={16} /> Unlock
          </MenuItem>
        )}
        <MenuItem onClick={() => { setResetting(menu!.user); setMenu(null); }} sx={{ gap: 1.25 }}>
          <KeyRound size={16} /> Set new password
        </MenuItem>
        {menu?.user.email !== me?.email && (
          <MenuItem onClick={() => { setToggling(menu!.user); setMenu(null); }} sx={{ gap: 1.25, color: menu?.user.isActive ? 'error.main' : 'success.main' }}>
            <Power size={16} /> {menu?.user.isActive ? 'Deactivate' : 'Activate'}
          </MenuItem>
        )}
      </Menu>
      {editing !== null && <UserFormDialog open user={editing === 'new' ? null : editing} roles={roles} onClose={() => setEditing(null)} />}
      <PasswordResetDialog user={resetting} onClose={() => setResetting(null)} />
      <ConfirmDialog
        open={Boolean(toggling)}
        danger={toggling?.isActive}
        title={toggling?.isActive ? `Deactivate ${toggling.fullName}?` : `Activate ${toggling?.fullName}?`}
        message={toggling?.isActive ? 'They are signed out everywhere immediately and cannot sign in until reactivated.' : 'They will be able to sign in again.'}
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Activate'}
        loading={toggle.isPending}
        onConfirm={() => toggling && toggle.mutate(toggling)}
        onClose={() => setToggling(null)}
      />
    </>
  );
}

function RolesTab({ roles, canManage }: { roles: RoleDto[]; canManage: boolean }) {
  const permissions = useQuery({ queryKey: ['roles', 'permissions'], queryFn: usersApi.permissions });
  const [editing, setEditing] = useState<RoleDto | null | 'new'>(null);
  const [deleting, setDeleting] = useState<RoleDto | null>(null);
  const remove = useApiMutation((r: RoleDto) => usersApi.deleteRole(r.id), { success: 'Role deleted', invalidate: [['roles']], onSuccess: () => setDeleting(null) });
  const total = permissions.data?.length ?? 0;

  return (
    <Box sx={{ p: 3 }}>
      {canManage && (
        <Stack direction="row" sx={{ justifyContent: 'flex-end', mb: 2 }}>
          <Button variant="contained" startIcon={<Plus size={17} />} onClick={() => setEditing('new')} disabled={!permissions.data}>
            Create role
          </Button>
        </Stack>
      )}
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' } }}>
        {roles.map((r, i) => (
          <Card key={r.id} component={motion.div} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} sx={{ p: 2.5, boxShadow: 'none', border: (t) => `1px solid ${t.palette.divider}` }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
              <IconTile icon={ShieldCheck} color={chartColors[i % chartColors.length]!} size={40} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" noWrap>
                  {r.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {r.code} · {r.users} user{r.users === 1 ? '' : 's'} {r.isSystem ? '· built-in' : '· custom'}
                </Typography>
              </Box>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ minHeight: 40 }}>
              {r.description}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {r.editable ? `${r.permissions.length} / ${total} permissions` : 'All permissions (fixed)'}
            </Typography>
            {canManage && (
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, justifyContent: 'flex-end' }}>
                {!r.isSystem && (
                  <Tooltip title="Delete role">
                    <IconButton size="small" color="error" onClick={() => setDeleting(r)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </Tooltip>
                )}
                <Button size="small" variant="outlined" startIcon={<Pencil size={15} />} disabled={!r.editable || !permissions.data} onClick={() => setEditing(r)}>
                  Edit permissions
                </Button>
              </Stack>
            )}
          </Card>
        ))}
      </Box>
      {editing !== null && permissions.data && <RoleEditorDialog open role={editing === 'new' ? null : editing} permissions={permissions.data} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        danger
        title={`Delete role ${deleting?.name}?`}
        message="Roles assigned to users cannot be deleted."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />
    </Box>
  );
}

export function UsersPage() {
  const theme = useTheme();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'roles' ? 'roles' : 'users';
  const canManage = useAuthStore((s) => s.hasPermission('users.manage'));
  const roles = useQuery({ queryKey: ['roles'], queryFn: usersApi.roles });

  return (
    <>
      <PageHeader icon={<IconTile icon={Users} color={brand.sky.main} size={52} />} title="User Management" subtitle="Users, roles, permissions and company-level access" />
      <Card>
        <Tabs value={tab} onChange={(_, v) => setParams({ tab: v }, { replace: true })} sx={{ px: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
          <Tab value="users" label="Users" />
          <Tab value="roles" label="Roles & permissions" />
        </Tabs>
        {roles.error ? (
          <ErrorState message={toApiError(roles.error).message} onRetry={() => void roles.refetch()} compact />
        ) : !roles.data ? (
          <Skeleton variant="rounded" height={300} sx={{ m: 3 }} />
        ) : tab === 'users' ? (
          <UsersTab roles={roles.data} canManage={canManage} />
        ) : (
          <RolesTab roles={roles.data} canManage={canManage} />
        )}
      </Card>
    </>
  );
}
