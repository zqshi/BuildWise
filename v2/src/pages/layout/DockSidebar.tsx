import { memo, type RefObject } from "react";
import { canAccessGovernanceEntries } from "../governance/permissionSettingsModel";
import type { AuthTenantSummary } from "../../app/authTenantSession";

type DockSidebarProps = {
  activeView: "dashboard" | "projects" | "permissions";
  currentRole: "owner" | "pm" | "developer" | "qa" | "viewer";
  dockUserLabel: string;
  dockUserAvatar: string;
  tenants: AuthTenantSummary[];
  currentTenantId: string;
  showUserMenu: boolean;
  userMenuRef: RefObject<HTMLDivElement>;
  onShowDashboard: () => void;
  onShowProjects: () => void;
  onToggleUserMenu: () => void;
  onOpenPolicyManager: () => void;
  onOpenOpenclawDialog: () => void;
  onSwitchTenant: (tenantId: string) => void;
  onLogout: () => void;
};

export const DockSidebar = memo(function DockSidebar({
  activeView,
  currentRole,
  dockUserLabel,
  dockUserAvatar,
  tenants,
  currentTenantId,
  showUserMenu,
  userMenuRef,
  onShowDashboard,
  onShowProjects,
  onToggleUserMenu,
  onOpenPolicyManager,
  onOpenOpenclawDialog,
  onSwitchTenant,
  onLogout
}: DockSidebarProps) {
  const isAdmin = canAccessGovernanceEntries(currentRole);
  const iconClassName = "dock-icon";

  return (
    <aside className="dock">
      <div className="dock-logo" aria-label="BuildWise">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={iconClassName}>
          <path d="M7 6a2 2 0 0 1 2-2h6v4H9a2 2 0 0 1-2-2Z" fill="currentColor" />
          <path d="M5 11a2 2 0 0 1 2-2h8v4H7a2 2 0 0 1-2-2Z" fill="currentColor" opacity=".86" />
          <path d="M9 14h10v2a4 4 0 0 1-4 4H9v-6Z" fill="currentColor" opacity=".72" />
        </svg>
      </div>
      <div className="dock-group">
        <button
          type="button"
          className={`dock-item ${activeView === "dashboard" ? "active" : ""}`}
          title="仪表盘"
          onClick={onShowDashboard}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={iconClassName}>
            <rect x="4" y="4" width="7" height="7" rx="2" fill="currentColor" />
            <rect x="13" y="4" width="7" height="5" rx="2" fill="currentColor" opacity=".72" />
            <rect x="13" y="11" width="7" height="9" rx="2" fill="currentColor" />
            <rect x="4" y="13" width="7" height="7" rx="2" fill="currentColor" opacity=".72" />
          </svg>
        </button>
        <button
          type="button"
          className={`dock-item ${activeView === "projects" ? "active" : ""}`}
          title="项目库"
          onClick={onShowProjects}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={iconClassName}>
            <path d="M4 7a3 3 0 0 1 3-3h4v5H4V7Z" fill="currentColor" />
            <path d="M13 4h4a3 3 0 0 1 3 3v2h-7V4Z" fill="currentColor" opacity=".72" />
            <path d="M4 11h7v9H7a3 3 0 0 1-3-3v-6Z" fill="currentColor" opacity=".72" />
            <path d="M13 11h7v6a3 3 0 0 1-3 3h-4v-9Z" fill="currentColor" />
          </svg>
        </button>
      </div>
      <div className="dock-group bottom">
        <div className="dock-user" ref={userMenuRef}>
          <button type="button" className="dock-avatar-btn" title={dockUserLabel} onClick={onToggleUserMenu}>
            <img src={dockUserAvatar} alt={dockUserLabel} className="dock-avatar" />
          </button>
          {showUserMenu ? (
            <div className="dock-user-menu">
              {tenants.length > 1 ? (
                <div className="dock-user-menu-section">
                  <span className="dock-user-menu-title">当前租户</span>
                  {tenants.map((item) => (
                    <button
                      key={item.tenantId}
                      type="button"
                      className={`dock-user-menu-item ${item.tenantId === currentTenantId ? "active" : ""}`}
                      onClick={() => onSwitchTenant(item.tenantId)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {isAdmin ? (
                <>
                  <button type="button" className="dock-user-menu-item" onClick={onOpenPolicyManager}>
                    权限管理
                  </button>
                  <button type="button" className="dock-user-menu-item" onClick={onOpenOpenclawDialog}>
                    业务助手
                  </button>
                </>
              ) : null}
              <button type="button" className="dock-user-menu-item" onClick={onLogout}>
                退出登录
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
});
