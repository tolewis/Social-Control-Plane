import type { ReactElement, ReactNode, SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement> & {
  title?: string;
};

function BaseIcon({ title, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : 'presentation'}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconGauge(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Overview'} {...props}>
      <path d="M4 13a8 8 0 1 1 16 0" />
      <path d="M12 13l3-3" />
      <path d="M6 20h12" />
    </BaseIcon>
  );
}

export function IconQueue(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Queue'} {...props}>
      <path d="M7 6h10" />
      <path d="M7 12h10" />
      <path d="M7 18h10" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </BaseIcon>
  );
}

export function IconCheckSquare(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Review'} {...props}>
      <path d="M9 11l2 2 4-4" />
      <path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    </BaseIcon>
  );
}

export function IconPlug(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Connections'} {...props}>
      <path d="M9 7v4" />
      <path d="M15 7v4" />
      <path d="M8 11h8" />
      <path d="M7 11v2a5 5 0 0 0 10 0v-2" />
      <path d="M12 18v3" />
    </BaseIcon>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Search'} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" />
    </BaseIcon>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Action'} {...props}>
      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
    </BaseIcon>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Alert'} {...props}>
      <path d="M10.3 4.2l-7.8 13.5a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </BaseIcon>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Expand'} {...props}>
      <path d="M6 9l6 6 6-6" />
    </BaseIcon>
  );
}

/* ── Provider brand icons (filled, no stroke) ── */

type ProviderIconProps = { size?: number; className?: string };

export function IconLinkedIn({ size = 20, className }: ProviderIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path d="M7.5 9.5h2v7h-2zM8.5 6.5a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3zM11.5 9.5h1.9v1h0a2.1 2.1 0 0 1 1.9-1c2 0 2.4 1.3 2.4 3.1v3.9h-2v-3.4c0-.8 0-1.9-1.2-1.9s-1.3.9-1.3 1.8v3.5h-2z" fill="#fff" />
    </svg>
  );
}

export function IconFacebook({ size = 20, className }: ProviderIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <rect width="24" height="24" rx="4" fill="#1877F2" />
      <path d="M16.5 12.5h-2.5v8h-3v-8h-2v-2.5h2v-1.5c0-2.2 1-3.5 3.5-3.5h2v2.5h-1.3c-.9 0-1.2.4-1.2 1.2v1.3h2.5z" fill="#fff" />
    </svg>
  );
}

export function IconInstagram({ size = 20, className }: ProviderIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id="ig" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFC107" />
          <stop offset=".5" stopColor="#F44336" />
          <stop offset="1" stopColor="#9C27B0" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="4" fill="url(#ig)" />
      <rect x="5" y="5" width="14" height="14" rx="4" stroke="#fff" strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="12" r="3.5" stroke="#fff" strokeWidth="1.5" fill="none" />
      <circle cx="17" cy="7" r="1" fill="#fff" />
    </svg>
  );
}

export function IconX({ size = 20, className }: ProviderIconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <rect width="24" height="24" rx="4" fill="#000" />
      <path d="M16.3 5.5h2.1l-4.6 5.3 5.4 7.2h-4.2l-3.3-4.4-3.8 4.4H5.8l4.9-5.6L5.5 5.5h4.3l3 4 3.5-4zm-.7 11.2h1.2L9.5 6.7H8.2z" fill="#fff" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Add'} {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </BaseIcon>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Calendar'} {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </BaseIcon>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Previous'} {...props}>
      <path d="M15 18l-6-6 6-6" />
    </BaseIcon>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Next'} {...props}>
      <path d="M9 18l6-6-6-6" />
    </BaseIcon>
  );
}

export function IconSend(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Send'} {...props}>
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22 11 13 2 9z" />
    </BaseIcon>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Refresh'} {...props}>
      <path d="M1 4v6h6" />
      <path d="M23 20v-6h-6" />
      <path d="M20.5 9A9 9 0 0 0 5.6 5.6L1 10" />
      <path d="M3.5 15a9 9 0 0 0 14.9 3.4L23 14" />
    </BaseIcon>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Delete'} {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </BaseIcon>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Edit'} {...props}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
    </BaseIcon>
  );
}

export function IconClock(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Schedule'} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </BaseIcon>
  );
}

export function IconGear(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Settings'} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </BaseIcon>
  );
}

export function IconKey(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Key'} {...props}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </BaseIcon>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Users'} {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </BaseIcon>
  );
}

export function IconBook(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Help'} {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </BaseIcon>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Copy'} {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </BaseIcon>
  );
}

export function IconRetry(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Retry'} {...props}>
      <path d="M1 4v6h6" />
      <path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10" />
    </BaseIcon>
  );
}

export function IconX_Close(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Close'} {...props}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </BaseIcon>
  );
}

export function IconChat(props: IconProps) {
  return (
    <BaseIcon title={props.title ?? 'Engage'} {...props}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </BaseIcon>
  );
}

const providerIcons: Record<string, (props: ProviderIconProps) => ReactElement> = {
  linkedin: IconLinkedIn,
  facebook: IconFacebook,
  instagram: IconInstagram,
  x: IconX,
};

export function ProviderIcon({ provider, size = 20, className }: ProviderIconProps & { provider: string }) {
  const Icon = providerIcons[provider];
  if (!Icon) return null;
  return <Icon size={size} className={className} />;
}
