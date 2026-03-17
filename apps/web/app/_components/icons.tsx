import type { ReactNode, SVGProps } from 'react';

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
