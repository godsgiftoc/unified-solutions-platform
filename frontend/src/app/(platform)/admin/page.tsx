"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Shield, ShieldOff, UserPlus, UserX, Users } from "lucide-react";
import { useState } from "react";

import { Badge, Button, EmptyState, Field, Modal, PageHeader, Skeleton, inputClass } from "@/components/ui";
import { useConfirm, usePrompt } from "@/lib/confirm";
import { Admin, type AdminUser, type Me } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useToast } from "@/lib/toast";

export default function AdminPage() {
  const qc = useQueryClient();
  const me = qc.getQueryData<Me>(["me"]);
  const { toast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [createOpen, setCreateOpen] = useState(false);

  const users = useQuery({ queryKey: ["admin-users"], queryFn: Admin.listUsers, enabled: !!me?.is_org_admin });

  const patch = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof Admin.updateUser>[1] }) =>
      Admin.updateUser(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: () => toast("Couldn't update the user", "error"),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => Admin.deactivateUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast("User deactivated");
    },
    onError: () => toast("Couldn't deactivate the user", "error"),
  });

  if (!me?.is_org_admin) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Superadmin only"
        description="You need superadmin access to manage users. Ask an administrator if you need it."
      />
    );
  }

  const resetPassword = async (u: AdminUser) => {
    const pw = await prompt({
      title: `Reset password for ${u.username}`,
      label: "New password",
      placeholder: "At least 8 characters",
      confirmLabel: "Reset password",
    });
    if (pw && pw.length >= 1) {
      await patch.mutateAsync({ id: u.id, patch: { password: pw } });
      toast("Password reset");
    }
  };

  const toggleAdmin = async (u: AdminUser) => {
    const makeAdmin = !u.is_org_admin;
    const ok = await confirm({
      title: makeAdmin ? `Make ${u.username} a superadmin?` : `Remove superadmin from ${u.username}?`,
      message: makeAdmin
        ? "Superadmins can create and manage all users."
        : "They'll keep their account but lose user-management access.",
      confirmLabel: makeAdmin ? "Make superadmin" : "Remove access",
      danger: !makeAdmin,
    });
    if (ok) patch.mutate({ id: u.id, patch: { is_org_admin: makeAdmin } });
  };

  const list = users.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Access control"
        title="Users"
        description="Create accounts and manage who can sign in. Only superadmins can see this page."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus size={16} /> Add user
          </Button>
        }
      />

      {users.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={Users} title="No users yet" description="Add your first teammate to get started." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Last sign-in</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {list.map((u) => {
                const isSelf = u.id === me.user_id;
                return (
                  <tr key={u.id} className={u.is_active ? "" : "opacity-55"}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-brand-950">{u.full_name || u.username}</div>
                      <div className="text-xs text-slate-400">@{u.username}{isSelf ? " · you" : ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      {u.is_org_admin ? <Badge tone="brand">Superadmin</Badge> : <Badge tone="muted">User</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Inactive</Badge>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{u.last_login_at ? timeAgo(u.last_login_at) : "Never"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="Reset password" onClick={() => resetPassword(u)}><KeyRound size={15} /></IconBtn>
                        {!isSelf && (
                          <IconBtn title={u.is_org_admin ? "Remove superadmin" : "Make superadmin"} onClick={() => toggleAdmin(u)}>
                            {u.is_org_admin ? <ShieldOff size={15} /> : <Shield size={15} />}
                          </IconBtn>
                        )}
                        {!isSelf && (u.is_active ? (
                          <IconBtn title="Deactivate" danger onClick={() => deactivate.mutate(u.id)}><UserX size={15} /></IconBtn>
                        ) : (
                          <IconBtn title="Reactivate" onClick={() => patch.mutate({ id: u.id, patch: { is_active: true } })}>
                            <Shield size={15} />
                          </IconBtn>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10 ${danger ? "hover:text-red-600" : "hover:text-brand-600"}`}
    >
      {children}
    </button>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      Admin.createUser({
        username: username.trim(),
        password,
        full_name: fullName.trim() || undefined,
        email: email.trim() || undefined,
        is_org_admin: isAdmin,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast(`Created @${username.trim()}`);
      onClose();
    },
    onError: (e: unknown) => toast(e instanceof Error ? e.message : "Couldn't create the user", "error"),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add user"
      description="Create a sign-in account. Share the username and password with them — they can change the password later."
      icon={UserPlus}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !username.trim() || password.length < 1}>
            {create.isPending ? "Creating…" : "Create user"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Full name (optional)">
          <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ada Lovelace" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username">
            <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ada" autoFocus />
          </Field>
          <Field label="Email (optional)">
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@org.com" />
          </Field>
        </div>
        <Field label="Temporary password">
          <input className={inputClass} type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set an initial password" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Make this user a superadmin (can manage other users)
        </label>
      </div>
    </Modal>
  );
}
