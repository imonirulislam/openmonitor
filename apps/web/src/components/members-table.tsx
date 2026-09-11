"use client";

import { Avatar, Badge, Button, LocalTime, Select } from "@openmonitor/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { changeMemberRole, removeMember, setUserActive } from "~/lib/actions/users";
import { DataTable } from "./data-table";

export type MemberRow = {
  userId: string;
  email: string;
  name: string | null;
  role: "admin" | "editor" | "viewer";
  isActive: boolean;
  lastLoginAt: string | null;
  /** True for the row that matches the currently signed-in user. */
  isSelf: boolean;
  /** True when the viewer can edit this row (admin && not self). */
  canEdit: boolean;
};

const ROLE_VARIANT: Record<MemberRow["role"], "default" | "info" | "outline"> = {
  admin: "info",
  editor: "default",
  viewer: "outline",
};

const columns: ColumnDef<MemberRow>[] = [
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span className="flex items-center gap-2 text-xs">
        <Avatar size="sm" name={row.original.name} email={row.original.email} />
        {row.original.email}
      </span>
    ),
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="text-xs">{row.original.name ?? "—"}</span>,
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => {
      const m = row.original;
      if (m.canEdit) {
        return (
          <form action={changeMemberRole} className="inline-flex">
            <input type="hidden" name="userId" value={m.userId} />
            <Select
              name="role"
              defaultValue={m.role}
              className="h-7 w-auto text-xs"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
              <option value="admin">admin</option>
            </Select>
          </form>
        );
      }
      return <Badge variant={ROLE_VARIANT[m.role]}>{m.role}</Badge>;
    },
    filterFn: (row, _id, value) =>
      !value || (Array.isArray(value) && value.length === 0)
        ? true
        : (value as string[]).includes(row.original.role),
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? "success" : "default"}>
        {row.original.isActive ? "active" : "inactive"}
      </Badge>
    ),
  },
  {
    accessorKey: "lastLoginAt",
    header: "Last login",
    cell: ({ row }) =>
      row.original.lastLoginAt ? (
        <LocalTime
          date={row.original.lastLoginAt}
          className="font-mono text-muted-foreground text-xs"
        />
      ) : (
        <span className="font-mono text-muted-foreground text-xs">—</span>
      ),
    sortingFn: (a, b) => {
      const ta = a.original.lastLoginAt ? Date.parse(a.original.lastLoginAt) : 0;
      const tb = b.original.lastLoginAt ? Date.parse(b.original.lastLoginAt) : 0;
      return ta - tb;
    },
  },
  {
    id: "actions",
    header: "",
    enableSorting: false,
    enableColumnFilter: false,
    cell: ({ row }) => {
      const m = row.original;
      if (m.isSelf) {
        return (
          <div className="text-right">
            <span className="text-muted-foreground text-xs">you</span>
          </div>
        );
      }
      if (!m.canEdit) return <div />;
      return (
        <div className="flex justify-end gap-2">
          <form action={setUserActive.bind(null, m.userId, !m.isActive)}>
            <Button variant="ghost" size="sm" type="submit" className="text-xs">
              {m.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </form>
          <form action={removeMember.bind(null, m.userId)}>
            <Button
              variant="ghost"
              size="sm"
              type="submit"
              className="text-destructive text-xs hover:text-destructive"
            >
              Remove
            </Button>
          </form>
        </div>
      );
    },
  },
];

export function MembersTable({ rows }: { rows: MemberRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      searchFields={["email", "name"]}
      filterPlaceholder="Filter members…"
      emptyMessage="No members yet."
      paramScope="members"
    />
  );
}
