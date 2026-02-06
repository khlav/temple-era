/**
 * Role icons for AngryAssignments template rendering.
 * SVG icons for {tank}, {healer}, {dps} placeholders.
 */

interface RoleIconProps {
  size?: number;
  className?: string;
}

/**
 * Tank role icon - Shield shape
 */
export function RoleIconTank({ size = 16, className }: RoleIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-label="Tank"
    >
      <path
        d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z"
        fill="#C0C0C0"
        stroke="#666"
        strokeWidth="0.5"
      />
    </svg>
  );
}

/**
 * Healer role icon - Medical cross
 */
export function RoleIconHealer({ size = 16, className }: RoleIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-label="Healer"
    >
      <rect
        x="10"
        y="4"
        width="4"
        height="16"
        fill="#00FF00"
        stroke="#006600"
        strokeWidth="0.5"
      />
      <rect
        x="4"
        y="10"
        width="16"
        height="4"
        fill="#00FF00"
        stroke="#006600"
        strokeWidth="0.5"
      />
    </svg>
  );
}

/**
 * DPS role icon - Crossed swords
 */
export function RoleIconDPS({ size = 16, className }: RoleIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-label="DPS"
    >
      {/* Left sword */}
      <path
        d="M4 4L14 14M4 4L6 4L4 6M14 14L12 16L16 12"
        stroke="#FF4444"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right sword */}
      <path
        d="M20 4L10 14M20 4L18 4L20 6M10 14L12 16L8 12"
        stroke="#FF4444"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Mapping of AA role codes to icon components
 */
export const ROLE_ICON_MAP: Record<
  string,
  React.ComponentType<RoleIconProps>
> = {
  "{tank}": RoleIconTank,
  "{healer}": RoleIconHealer,
  "{dps}": RoleIconDPS,
  "{damage}": RoleIconDPS,
};

/**
 * Get the role icon component for an AA code
 */
export function getRoleIcon(
  code: string,
): React.ComponentType<RoleIconProps> | null {
  return ROLE_ICON_MAP[code.toLowerCase()] ?? null;
}
