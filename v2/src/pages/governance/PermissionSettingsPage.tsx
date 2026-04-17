import { usePermissionSettingsState } from "./usePermissionSettingsState";
import {
  PermissionTabBar,
  PermissionMembersPanel,
  PermissionRoleMatrixPanel,
  PermissionDrawers
} from "./PermissionSettingsPanels";

type PermissionSettingsPageProps = {
  currentRole: "owner" | "pm" | "developer" | "qa" | "viewer";
};

export function PermissionSettingsPage({ currentRole }: PermissionSettingsPageProps) {
  const s = usePermissionSettingsState(currentRole);

  return (
    <section className="permissions-page">
      <section className="panel permissions-main">
        <PermissionTabBar
          activeTab={s.activeTab}
          onTabChange={(tab) => { s.setActiveTab(tab); if (tab === "roles") s.setSelectedMatrixRole("owner"); }}
        />
        {s.tabPanels.showMembersPanel ? (
          <PermissionMembersPanel
            isAdmin={s.isAdmin} busy={s.busy} rows={s.rows}
            searchKeyword={s.searchKeyword} onSearchChange={s.setSearchKeyword}
            editingUserId={s.editingUserId} editingRole={s.editingRole}
            memberBindingRoleOptions={s.memberBindingRoleOptions}
            onEditStart={(userId, role) => { s.setEditingUserId(userId); s.setEditingRole(role); }}
            onEditCancel={() => s.setEditingUserId("")}
            onEditingRoleChange={s.setEditingRole}
            onUpdate={(userId) => void s.handleUpdateBinding(userId)}
            onRemove={(userId) => void s.handleRemoveBinding(userId)}
            onAddClick={() => s.setShowAddMemberDrawer(true)}
          />
        ) : null}
        {s.tabPanels.showRolePanel ? (
          <PermissionRoleMatrixPanel
            roleRows={s.roleRows} selectedMatrixRole={s.selectedMatrixRole}
            onOpenRoleConfig={s.handleOpenRoleConfig}
          />
        ) : null}
        {s.notice ? <p className="permissions-notice">{s.notice}</p> : null}
      </section>
      <PermissionDrawers
        isAdmin={s.isAdmin} busy={s.busy}
        showAddMemberDrawer={s.showAddMemberDrawer} memberForm={s.memberForm}
        memberBindingRoleOptions={s.memberBindingRoleOptions}
        onMemberFormChange={s.setMemberForm}
        onCloseAddMember={() => s.setShowAddMemberDrawer(false)}
        onSubmitAddMember={() => void s.handleCreateBinding()}
        showAddRoleDrawer={s.showAddRoleDrawer} roleForm={s.roleForm}
        roleOptions={s.roleOptions} allPermissionPoints={s.allPermissionPoints}
        permissionPointTitleMap={s.permissionPointTitleMap}
        permissionMapByRole={s.permissionMapByRole}
        onRoleFormChange={s.setRoleForm}
        onCloseAddRole={() => s.setShowAddRoleDrawer(false)}
        onSubmitAddRole={() => void s.handleCreateRole()}
        showRoleConfigDrawer={s.showRoleConfigDrawer} roleTitle={s.roleTitle}
        selectedCustomRole={s.selectedCustomRole}
        rolePermissionDraft={s.rolePermissionDraft}
        onDraftChange={s.setRolePermissionDraft}
        groupedPermissionPoints={s.groupedPermissionPoints}
        onCloseRoleConfig={() => s.setShowRoleConfigDrawer(false)}
        onSaveRoleConfig={() => void s.handleSaveRolePermissions()}
      />
    </section>
  );
}
