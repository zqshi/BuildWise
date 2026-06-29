import { TARGET_PLATFORMS } from "../../domain/workspace/projectTypes";

/** 目标端枚举到中文展示名的映射（创建/编辑入口共享）。 */
export const TARGET_PLATFORM_LABELS: Record<string, string> = {
  web: "网页",
  ios: "iOS",
  android: "Android",
  harmony: "鸿蒙",
  linux: "Linux",
  windows: "Windows",
  macos: "macOS",
  server: "服务端",
  other: "其他"
};

/** 切换目标端勾选：已勾选则移除，未勾选则加入；取消至空时按需兜底 ["web"]（创建场景保留至少一端，编辑场景交后端兜底）。 */
export function toggleTargetPlatform(current: string[], platform: string, fallbackToWeb = true): string[] {
  if (current.includes(platform)) {
    const next = current.filter((item) => item !== platform);
    return fallbackToWeb && next.length === 0 ? ["web"] : next;
  }
  return [...current, platform];
}

export type TargetPlatformsPickerProps = {
  value: string[];
  onChange: (next: string[]) => void;
  /** 取消至空时是否兜底 ["web"]；创建场景 true，编辑场景 false（交后端 normalize）。默认 true。 */
  fallbackToWeb?: boolean;
};

/** 目标端多选 chip：受控 value + onChange，内部封装 toggle 与兜底逻辑，供创建表单与项目设置编辑入口复用。 */
export function TargetPlatformsPicker({ value, onChange, fallbackToWeb = true }: TargetPlatformsPickerProps) {
  return (
    <div className="target-platforms-options">
      {TARGET_PLATFORMS.map((platform) => {
        const checked = value.includes(platform);
        return (
          <label key={platform} className={`target-platform-chip ${checked ? "checked" : ""}`}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(toggleTargetPlatform(value, platform, fallbackToWeb))}
            />
            {TARGET_PLATFORM_LABELS[platform] ?? platform}
          </label>
        );
      })}
    </div>
  );
}
