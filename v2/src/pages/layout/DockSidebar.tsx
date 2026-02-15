import type { RefObject } from "react";

type DockSidebarProps = {
  activeView: "dashboard" | "projects";
  dockUserLabel: string;
  dockUserAvatar: string;
  showUserMenu: boolean;
  userMenuRef: RefObject<HTMLDivElement>;
  onShowDashboard: () => void;
  onShowProjects: () => void;
  onToggleUserMenu: () => void;
  onLogout: () => void;
};

export function DockSidebar({
  activeView,
  dockUserLabel,
  dockUserAvatar,
  showUserMenu,
  userMenuRef,
  onShowDashboard,
  onShowProjects,
  onToggleUserMenu,
  onLogout
}: DockSidebarProps) {
  return (
    <aside className="dock">
      <div className="dock-logo">BW</div>
      <div className="dock-group">
        <button
          type="button"
          className={`dock-item ${activeView === "dashboard" ? "active" : ""}`}
          title="仪表盘"
          onClick={onShowDashboard}
        >
          ◉
        </button>
        <button
          type="button"
          className={`dock-item ${activeView === "projects" ? "active" : ""}`}
          title="项目库"
          onClick={onShowProjects}
        >
          ▣
        </button>
      </div>
      <div className="dock-group bottom">
        <div className="dock-user" ref={userMenuRef}>
          <button type="button" className="dock-avatar-btn" title={dockUserLabel} onClick={onToggleUserMenu}>
            <img src={dockUserAvatar} alt={dockUserLabel} className="dock-avatar" />
          </button>
          {showUserMenu ? (
            <div className="dock-user-menu">
              <button type="button" className="dock-user-menu-item" onClick={onLogout}>
                退出登录
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
