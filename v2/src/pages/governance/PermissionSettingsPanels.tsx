import type { Dispatch, SetStateAction } from "react";
import { isBuiltinLockedRole, isValidMainlandPhone, type PermissionTab } from "./permissionSettingsModel";
import { avatarTextOf, maskUserId, AddUserIcon, CloseIcon } from "./permissionSettingsHelpers";
import type { PermissionMemberRow } from "./permissionSettingsModel";
import type { MemberForm, RoleForm, RoleRow } from "./usePermissionSettingsState";

/* ================================================================
   PermissionTabBar
   ================================================================ */

type TabBarProps = {
  activeTab: PermissionTab;
  onTabChange: (tab: PermissionTab) => void;
};

export function PermissionTabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="permissions-tabs">
      <button
        type="button"
        className={`permissions-tab ${activeTab === "members" ? "active" : ""}`}
        onClick={() => onTabChange("members")}
      >
        成员管理
      </button>
      <button
        type="button"
        className={`permissions-tab ${activeTab === "roles" ? "active" : ""}`}
        onClick={() => onTabChange("roles")}
      >
        角色权限
      </button>
    </div>
  );
}

/* ================================================================
   PermissionMembersPanel
   ================================================================ */

type MembersPanelProps = {
  isAdmin: boolean;
  busy: boolean;
  rows: PermissionMemberRow[];
  searchKeyword: string;
  onSearchChange: (value: string) => void;
  editingUserId: string;
  editingRole: string;
  memberBindingRoleOptions: Array<{ value: string; label: string }>;
  onEditStart: (userId: string, role: string) => void;
  onEditCancel: () => void;
  onEditingRoleChange: (value: string) => void;
  onUpdate: (userId: string) => void;
  onRemove: (userId: string) => void;
  onAddClick: () => void;
};

export function PermissionMembersPanel(p: MembersPanelProps) {
  return (
    <section className="permissions-members-section">
      <div className="permissions-toolbar">
        <label className="permissions-search-field" aria-label="搜索成员、团队或角色">
          <span aria-hidden="true">⌕</span>
          <input type="search" placeholder="搜索成员、团队或角色" value={p.searchKeyword} onChange={(e) => p.onSearchChange(e.target.value)} />
        </label>
        <button type="button" className="btn primary permissions-add-btn" onClick={p.onAddClick} disabled={!p.isAdmin} title={!p.isAdmin ? "仅系统负责人可新增成员" : undefined}>
          <AddUserIcon /><span>添加成员</span>
        </button>
      </div>
      <section className="permissions-table-shell">
        <div className="permissions-table-head">
          <span>用户名</span><span>角色</span><span>所属团队</span><span>加入时间</span><span>状态</span><span>操作</span>
        </div>
        <MemberTableBody
          rows={p.rows} isAdmin={p.isAdmin} busy={p.busy}
          editingUserId={p.editingUserId} editingRole={p.editingRole}
          memberBindingRoleOptions={p.memberBindingRoleOptions}
          onEditStart={p.onEditStart} onEditCancel={p.onEditCancel}
          onEditingRoleChange={p.onEditingRoleChange}
          onUpdate={p.onUpdate} onRemove={p.onRemove}
        />
        <div className="permissions-table-foot">
          <span>共 {p.rows.length} 名成员</span>
          <div className="permissions-pager" aria-hidden="true">
            <span className="pager-btn">‹</span><span className="pager-btn">›</span>
          </div>
        </div>
      </section>
    </section>
  );
}

/* ---- member table body (extracted to stay under 60-line limit) ---- */

type MemberTableBodyProps = {
  rows: PermissionMemberRow[];
  isAdmin: boolean;
  busy: boolean;
  editingUserId: string;
  editingRole: string;
  memberBindingRoleOptions: Array<{ value: string; label: string }>;
  onEditStart: (userId: string, role: string) => void;
  onEditCancel: () => void;
  onEditingRoleChange: (value: string) => void;
  onUpdate: (userId: string) => void;
  onRemove: (userId: string) => void;
};

function MemberTableBody({
  rows, isAdmin, busy, editingUserId, editingRole,
  memberBindingRoleOptions, onEditStart, onEditCancel,
  onEditingRoleChange, onUpdate, onRemove
}: MemberTableBodyProps) {
  return (
    <ul className="permissions-table-body">
      {rows.length === 0 ? (
        <li className="permissions-row empty">暂无成员数据</li>
      ) : rows.map((row) => (
        <li key={row.userId} className="permissions-row">
          <span className="user-cell">
            <span className="user-avatar">{avatarTextOf(row.userId)}</span>
            <span className="user-meta">
              <strong>{row.displayName}</strong>
              <em>{maskUserId(row.userId)}</em>
            </span>
          </span>
          <span>
            {editingUserId === row.userId ? (
              <select value={editingRole} onChange={(event) => onEditingRoleChange(event.target.value)}>
                {memberBindingRoleOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            ) : row.roleLabel}
          </span>
          <span>{row.teamName}</span>
          <span>{row.joinedAt}</span>
          <span className={`permissions-status-badge ${row.statusTone === "muted" ? "muted" : "ok"}`}>
            <i className="status-dot" />
            {row.statusLabel}
          </span>
          <MemberActionCell
            isAdmin={isAdmin}
            busy={busy}
            isEditing={editingUserId === row.userId}
            userId={row.userId}
            role={row.role}
            onEditStart={onEditStart}
            onEditCancel={onEditCancel}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        </li>
      ))}
    </ul>
  );
}

/* ---- member action cell ---- */

type MemberActionCellProps = {
  isAdmin: boolean;
  busy: boolean;
  isEditing: boolean;
  userId: string;
  role: string;
  onEditStart: (userId: string, role: string) => void;
  onEditCancel: () => void;
  onUpdate: (userId: string) => void;
  onRemove: (userId: string) => void;
};

function MemberActionCell({
  isAdmin, busy, isEditing, userId, role,
  onEditStart, onEditCancel, onUpdate, onRemove
}: MemberActionCellProps) {
  if (isEditing) {
    return (
      <span className="action-cell">
        <button type="button" className="link-btn" onClick={() => void onUpdate(userId)} disabled={!isAdmin || busy}>
          保存
        </button>
        <button type="button" className="link-btn muted" onClick={onEditCancel}>
          取消
        </button>
      </span>
    );
  }
  return (
    <span className="action-cell">
      <button type="button" className="link-btn" onClick={() => onEditStart(userId, role)} disabled={!isAdmin}>
        编辑
      </button>
      <button type="button" className="link-btn muted" onClick={() => void onRemove(userId)} disabled={!isAdmin || busy}>
        移除
      </button>
    </span>
  );
}

/* ================================================================
   PermissionRoleMatrixPanel
   ================================================================ */

type RoleMatrixPanelProps = {
  roleRows: RoleRow[];
  selectedMatrixRole: string;
  onOpenRoleConfig: (roleKey: string) => void;
};

export function PermissionRoleMatrixPanel({ roleRows, selectedMatrixRole, onOpenRoleConfig }: RoleMatrixPanelProps) {
  return (
    <section className="permissions-role-section">
      <div className="permissions-toolbar">
        <span className="permissions-role-hint">角色列表</span>
        <button
          type="button"
          className="btn primary permissions-add-role-btn upcoming"
          onClick={(event) => event.preventDefault()}
          aria-disabled="true"
          title="即将上线"
        >
          新增角色
        </button>
      </div>
      <section className="permissions-table-shell">
        <div className="permissions-role-table-head">
          <span>角色名称</span>
          <span>角色描述</span>
          <span>等级</span>
          <span>权限点</span>
          <span>更新时间</span>
          <span>操作</span>
        </div>
        <ul className="permissions-table-body">
          {roleRows.map((item) => (
            <li
              key={item.key}
              className={`permissions-role-row ${selectedMatrixRole === item.key ? "active" : ""} ${isBuiltinLockedRole(item.key) ? "locked" : ""}`}
            >
              <span>{item.label}</span>
              <span className="role-desc">{item.description}</span>
              <span>{item.level}</span>
              <span>{item.permissionCount}</span>
              <span>{item.updatedAt}</span>
              <span className="action-cell">
                {isBuiltinLockedRole(item.key) ? (
                  <button type="button" className="link-btn muted" disabled title="系统内置角色暂不支持操作">
                    不支持操作
                  </button>
                ) : (
                  <button type="button" className="link-btn" onClick={() => onOpenRoleConfig(item.key)}>
                    配置权限
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

/* ================================================================
   PermissionAddMemberDrawer
   ================================================================ */

type AddMemberDrawerProps = {
  open: boolean;
  isAdmin: boolean;
  busy: boolean;
  memberForm: MemberForm;
  memberBindingRoleOptions: Array<{ value: string; label: string }>;
  onFormChange: React.Dispatch<React.SetStateAction<MemberForm>>;
  onClose: () => void;
  onSubmit: () => void;
};

export function PermissionAddMemberDrawer({
  open, isAdmin, busy, memberForm, memberBindingRoleOptions,
  onFormChange, onClose, onSubmit
}: AddMemberDrawerProps) {
  return (
    <>
      <div
        className={`permissions-drawer-mask ${open ? "open" : ""}`}
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        role="button"
        tabIndex={0}
        aria-label="关闭"
      />
      <aside className={`permissions-form-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <header className="permissions-form-head">
          <h3>添加新成员</h3>
          <button type="button" className="permissions-close-btn" onClick={onClose}><CloseIcon /></button>
        </header>
        <AddMemberDrawerBody
          memberForm={memberForm}
          memberBindingRoleOptions={memberBindingRoleOptions}
          onFormChange={onFormChange}
        />
        <footer className="permissions-form-foot">
          <button type="button" className="btn ghost" onClick={onClose}>取消</button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void onSubmit()}
            disabled={!isAdmin || busy || !memberForm.name.trim() || !isValidMainlandPhone(memberForm.phone)}
          >
            确认添加
          </button>
        </footer>
      </aside>
    </>
  );
}

/* ---- add-member drawer body ---- */

type AddMemberDrawerBodyProps = {
  memberForm: MemberForm;
  memberBindingRoleOptions: Array<{ value: string; label: string }>;
  onFormChange: React.Dispatch<React.SetStateAction<MemberForm>>;
};

function AddMemberDrawerBody({ memberForm, memberBindingRoleOptions, onFormChange }: AddMemberDrawerBodyProps) {
  return (
    <div className="permissions-form-body">
      <label>
        <span>成员姓名 *</span>
        <input value={memberForm.name} onChange={(e) => onFormChange((prev) => ({ ...prev, name: e.target.value }))} placeholder="请输入真实姓名" />
      </label>
      <label>
        <span>手机号 *</span>
        <input value={memberForm.phone} onChange={(e) => onFormChange((prev) => ({ ...prev, phone: e.target.value }))} placeholder="请输入11位手机号" />
        <small>被添加手机号可使用"手机号+验证码"登录平台</small>
      </label>
      <label>
        <span>所属部门</span>
        <input value={memberForm.department} onChange={(e) => onFormChange((prev) => ({ ...prev, department: e.target.value }))} placeholder="请输入部门" />
      </label>
      <label>
        <span>分配角色 *</span>
        <select value={memberForm.roleKey} onChange={(e) => onFormChange((prev) => ({ ...prev, roleKey: e.target.value }))}>
          {memberBindingRoleOptions.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <small>角色选项来自"角色权限"页的真实角色集合，保存后立即持久化生效。</small>
      </label>
      <div className="permissions-form-row-two">
        <label>
          <span>生效时间</span>
          <input type="date" value={memberForm.validFrom} onChange={(e) => onFormChange((prev) => ({ ...prev, validFrom: e.target.value }))} />
        </label>
        <label>
          <span>失效时间</span>
          <input type="date" value={memberForm.validTo} onChange={(e) => onFormChange((prev) => ({ ...prev, validTo: e.target.value }))} />
        </label>
      </div>
      <label>
        <span>备注</span>
        <textarea
          value={memberForm.note}
          onChange={(e) => onFormChange((prev) => ({ ...prev, note: e.target.value }))}
          placeholder="添加额外说明"
          rows={3}
        />
      </label>
    </div>
  );
}

/* ================================================================
   PermissionAddRoleDrawer
   ================================================================ */

type AddRoleDrawerProps = {
  open: boolean;
  isAdmin: boolean;
  busy: boolean;
  roleForm: RoleForm;
  roleOptions: Array<{ key: string; label: string }>;
  allPermissionPoints: string[];
  permissionPointTitleMap: Map<string, string>;
  permissionMapByRole: Map<string, string[]>;
  onFormChange: React.Dispatch<React.SetStateAction<RoleForm>>;
  onClose: () => void;
  onSubmit: () => void;
};

export function PermissionAddRoleDrawer({
  open, isAdmin, busy, roleForm, roleOptions,
  allPermissionPoints, permissionPointTitleMap, permissionMapByRole,
  onFormChange, onClose, onSubmit
}: AddRoleDrawerProps) {
  return (
    <>
      <div
        className={`permissions-drawer-mask ${open ? "open" : ""}`}
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        role="button"
        tabIndex={0}
        aria-label="关闭"
      />
      <aside className={`permissions-form-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <header className="permissions-form-head">
          <h3>添加新角色</h3>
          <button type="button" className="permissions-close-btn" onClick={onClose}><CloseIcon /></button>
        </header>
        <AddRoleDrawerBody
          roleForm={roleForm}
          roleOptions={roleOptions}
          allPermissionPoints={allPermissionPoints}
          permissionPointTitleMap={permissionPointTitleMap}
          permissionMapByRole={permissionMapByRole}
          onFormChange={onFormChange}
        />
        <footer className="permissions-form-foot">
          <button type="button" className="btn ghost" onClick={onClose}>取消</button>
          <button type="button" className="btn primary" onClick={() => void onSubmit()} disabled={!isAdmin || busy || !roleForm.name.trim()}>
            创建角色
          </button>
        </footer>
      </aside>
    </>
  );
}

/* ---- add-role drawer body ---- */

type AddRoleDrawerBodyProps = {
  roleForm: RoleForm;
  roleOptions: Array<{ key: string; label: string }>;
  allPermissionPoints: string[];
  permissionPointTitleMap: Map<string, string>;
  permissionMapByRole: Map<string, string[]>;
  onFormChange: React.Dispatch<React.SetStateAction<RoleForm>>;
};

function AddRoleDrawerBody(p: AddRoleDrawerBodyProps) {
  const handleCloneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cloneFrom = e.target.value;
    const cloned = cloneFrom && p.permissionMapByRole.has(cloneFrom) ? p.permissionMapByRole.get(cloneFrom) || [] : [];
    p.onFormChange((prev) => ({ ...prev, cloneFrom, selectedPermissions: [...cloned] }));
  };
  const handlePermToggle = (permission: string, checked: boolean) => {
    p.onFormChange((prev) => ({
      ...prev,
      selectedPermissions: checked
        ? [...prev.selectedPermissions, permission]
        : prev.selectedPermissions.filter((item) => item !== permission)
    }));
  };
  return (
    <div className="permissions-form-body">
      <label>
        <span>角色名称</span>
        <input value={p.roleForm.name} onChange={(e) => p.onFormChange((prev) => ({ ...prev, name: e.target.value }))} placeholder="请输入角色名称" />
      </label>
      <label>
        <span>角色描述</span>
        <textarea value={p.roleForm.description} onChange={(e) => p.onFormChange((prev) => ({ ...prev, description: e.target.value }))} rows={3} />
      </label>
      <div className="permissions-form-row-two">
        <label>
          <span>复制权限自</span>
          <select value={p.roleForm.cloneFrom} onChange={handleCloneChange}>
            <option value="">不复制</option>
            {p.roleOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span>角色等级</span>
          <input type="number" min={1} max={9} value={p.roleForm.level} onChange={(e) => p.onFormChange((prev) => ({ ...prev, level: Number(e.target.value) || 1 }))} />
        </label>
      </div>
      <fieldset className="permissions-checkbox-group">
        <legend>权限点配置</legend>
        {p.allPermissionPoints.map((perm) => (
          <label key={perm}>
            <input type="checkbox" checked={p.roleForm.selectedPermissions.includes(perm)} onChange={(e) => handlePermToggle(perm, e.target.checked)} />
            <span>{p.permissionPointTitleMap.get(perm) || perm}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/* ================================================================
   PermissionRoleConfigDrawer
   ================================================================ */

type RoleConfigDrawerProps = {
  open: boolean;
  isAdmin: boolean;
  busy: boolean;
  roleTitle: string;
  selectedCustomRole: { key: string } | null;
  rolePermissionDraft: string[];
  onDraftChange: React.Dispatch<React.SetStateAction<string[]>>;
  groupedPermissionPoints: Array<{ key: string; title: string; items: Array<{ key: string; title: string }> }>;
  onClose: () => void;
  onSave: () => void;
};

export function PermissionRoleConfigDrawer({
  open, isAdmin, busy, roleTitle, selectedCustomRole,
  rolePermissionDraft, onDraftChange, groupedPermissionPoints,
  onClose, onSave
}: RoleConfigDrawerProps) {
  return (
    <>
      <div
        className={`permissions-drawer-mask ${open ? "open" : ""}`}
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        role="button"
        tabIndex={0}
        aria-label="关闭"
      />
      <aside className={`permissions-form-drawer wide ${open ? "open" : ""}`} aria-hidden={!open}>
        <header className="permissions-form-head">
          <h3>{roleTitle} 权限配置</h3>
          <button type="button" className="permissions-close-btn" onClick={onClose}><CloseIcon /></button>
        </header>
        <div className="permissions-form-body">
          {groupedPermissionPoints.map((group) => (
            <fieldset key={group.key} className="permissions-checkbox-group">
              <legend>{group.title}</legend>
              {group.items.map((item) => (
                <label key={item.key}>
                  <input
                    type="checkbox"
                    checked={rolePermissionDraft.includes(item.key)}
                    disabled={!selectedCustomRole}
                    onChange={(event) =>
                      onDraftChange((prev) =>
                        event.target.checked ? [...prev, item.key] : prev.filter((x) => x !== item.key)
                      )
                    }
                  />
                  <span>{item.title}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <footer className="permissions-form-foot">
          <button type="button" className="btn ghost" onClick={onClose}>取消</button>
          <button type="button" className="btn primary" onClick={() => void onSave()} disabled={!isAdmin || busy || !selectedCustomRole}>
            保存权限
          </button>
        </footer>
      </aside>
    </>
  );
}

/* ================================================================
   PermissionDrawers — composite wrapper for all three drawers
   ================================================================ */

type PermissionDrawersProps = {
  isAdmin: boolean;
  busy: boolean;
  /* add-member */
  showAddMemberDrawer: boolean;
  memberForm: MemberForm;
  memberBindingRoleOptions: Array<{ value: string; label: string }>;
  onMemberFormChange: Dispatch<SetStateAction<MemberForm>>;
  onCloseAddMember: () => void;
  onSubmitAddMember: () => void;
  /* add-role */
  showAddRoleDrawer: boolean;
  roleForm: RoleForm;
  roleOptions: Array<{ key: string; label: string }>;
  allPermissionPoints: string[];
  permissionPointTitleMap: Map<string, string>;
  permissionMapByRole: Map<string, string[]>;
  onRoleFormChange: Dispatch<SetStateAction<RoleForm>>;
  onCloseAddRole: () => void;
  onSubmitAddRole: () => void;
  /* role-config */
  showRoleConfigDrawer: boolean;
  roleTitle: string;
  selectedCustomRole: { key: string } | null;
  rolePermissionDraft: string[];
  onDraftChange: Dispatch<SetStateAction<string[]>>;
  groupedPermissionPoints: Array<{ key: string; title: string; items: Array<{ key: string; title: string }> }>;
  onCloseRoleConfig: () => void;
  onSaveRoleConfig: () => void;
};

export function PermissionDrawers(p: PermissionDrawersProps) {
  return (
    <>
      <PermissionAddMemberDrawer
        open={p.showAddMemberDrawer}
        isAdmin={p.isAdmin}
        busy={p.busy}
        memberForm={p.memberForm}
        memberBindingRoleOptions={p.memberBindingRoleOptions}
        onFormChange={p.onMemberFormChange}
        onClose={p.onCloseAddMember}
        onSubmit={p.onSubmitAddMember}
      />
      <PermissionAddRoleDrawer
        open={p.showAddRoleDrawer}
        isAdmin={p.isAdmin}
        busy={p.busy}
        roleForm={p.roleForm}
        roleOptions={p.roleOptions}
        allPermissionPoints={p.allPermissionPoints}
        permissionPointTitleMap={p.permissionPointTitleMap}
        permissionMapByRole={p.permissionMapByRole}
        onFormChange={p.onRoleFormChange}
        onClose={p.onCloseAddRole}
        onSubmit={p.onSubmitAddRole}
      />
      <PermissionRoleConfigDrawer
        open={p.showRoleConfigDrawer}
        isAdmin={p.isAdmin}
        busy={p.busy}
        roleTitle={p.roleTitle}
        selectedCustomRole={p.selectedCustomRole}
        rolePermissionDraft={p.rolePermissionDraft}
        onDraftChange={p.onDraftChange}
        groupedPermissionPoints={p.groupedPermissionPoints}
        onClose={p.onCloseRoleConfig}
        onSave={p.onSaveRoleConfig}
      />
    </>
  );
}
