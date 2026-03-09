import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'settings'
  | 'logout'
  | 'menu'
  | 'arrow-down-right'
  | 'restaurant'
  | 'car'
  | 'bolt'
  | 'cart'
  | 'wallet'
  | 'close'
  | 'check-circle'
  | 'error-circle'
  | 'mail'
  | 'trash'
  | 'info'
  | 'red-card'
  | 'health'
  | 'subscription'
  | 'delivery'
  | 'education'
  | 'shirt'
  | 'gamepad'
  | 'target'
  | 'alert-triangle'
  | 'pie-chart'
  | 'bank'
  | 'pencil'
  | 'chevron-left'
  | 'chevron-right'
  | 'income'
  | 'sun'
  | 'moon'
  | 'calendar'
  | 'chevron-down'
  | 'credit-card'
  | 'cash'
  | 'transfer'
  | 'coffee'
  | 'shopping-bag'
  | 'trending-down';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  name: IconName;
};

const baseProps: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function Icon({ name, ...props }: IconProps) {
  switch (name) {
    case 'home':
      return (
        <svg {...baseProps} {...props}>
          <path d="M3 10.8L12 4l9 6.8" />
          <path d="M5 9.7V20h14V9.7" />
          <path d="M9.3 20v-5.4h5.4V20" />
        </svg>
      );

    case 'settings':
      return (
        <svg {...baseProps} {...props}>
          <circle cx="12" cy="12" r="3.1" />
          <path d="M19.4 15.1a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1 1a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.2a1 1 0 0 1-1 1h-1.4a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1-1a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.4a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1-1a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1 1 0 0 1 1 1v1.4a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" />
        </svg>
      );

    case 'logout':
      return (
        <svg {...baseProps} {...props}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );

    case 'menu':
      return (
        <svg {...baseProps} {...props}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      );

    case 'arrow-down-right':
      return (
        <svg {...baseProps} {...props}>
          <path d="M7 7l10 10" />
          <path d="M7 17h10V7" />
        </svg>
      );

    case 'restaurant':
      return (
        <svg {...baseProps} {...props}>
          <path d="M5 3v7" />
          <path d="M7.8 3v7" />
          <path d="M6.4 10v11" />
          <path d="M12.8 3c2.2 0 3.8 1.8 3.8 4v14" />
          <path d="M12.8 11h3.8" />
        </svg>
      );

    case 'car':
      return (
        <svg {...baseProps} {...props}>
          <path d="M5 15l1.2-4.3A2 2 0 0 1 8.2 9h7.6a2 2 0 0 1 2 1.7L19 15" />
          <path d="M4 15h16v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4z" />
          <circle cx="7.5" cy="15" r="1" />
          <circle cx="16.5" cy="15" r="1" />
        </svg>
      );

    case 'bolt':
      return (
        <svg {...baseProps} {...props}>
          <path d="M13 2L5 13h5l-1 9 8-11h-5l1-9z" />
        </svg>
      );

    case 'cart':
      return (
        <svg {...baseProps} {...props}>
          <circle cx="10" cy="20" r="1.4" />
          <circle cx="17" cy="20" r="1.4" />
          <path d="M3 4h2l2.4 10h10l2-7H7.2" />
        </svg>
      );

    case 'wallet':
      return (
        <svg {...baseProps} {...props}>
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h12A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-12A2.5 2.5 0 0 1 3 16.5z" />
          <path d="M14.5 12h5" />
          <circle cx="14.5" cy="12" r="0.9" />
        </svg>
      );

    case 'close':
      return (
        <svg {...baseProps} {...props}>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </svg>
      );

    case 'check-circle':
      return (
        <svg {...baseProps} {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l2.5 2.5L16 9.5" />
        </svg>
      );

    case 'error-circle':
      return (
        <svg {...baseProps} {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );

    case 'mail':
      return (
        <svg {...baseProps} {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M4 7l8 6 8-6" />
        </svg>
      );

    case 'trash':
      return (
        <svg {...baseProps} {...props}>
          <path d="M4 7h16" />
          <path d="M9 7V5h6v2" />
          <path d="M6.5 7l.8 12.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.5 7" />
          <path d="M10 11.2v6.2" />
          <path d="M14 11.2v6.2" />
        </svg>
      );

    case 'info':
      return (
        <svg {...baseProps} {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11.2V16" />
          <circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );

    case 'red-card':
      return (
        <svg {...baseProps} {...props}>
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h12A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-12A2.5 2.5 0 0 1 3 16.5z" />
          <path d="M14.5 12h5" />
          <circle cx="14.5" cy="12" r="0.9" />
        </svg>
      );

    case 'health':
      return (
        <svg {...baseProps} {...props}>
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      );

    case 'subscription':
      return (
        <svg {...baseProps} {...props}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M8 12h8" />
          <path d="M12 8v8" />
        </svg>
      );

    case 'delivery':
      return (
        <svg {...baseProps} {...props}>
          <path d="M16 3h5v5" />
          <path d="M21 3l-7 7" />
          <path d="M3 12a9 9 0 0 0 9 9 9 9 0 0 0 6-2.3" />
          <path d="M21 12a9 9 0 0 0-2.3-6" />
        </svg>
      );

    case 'education':
      return (
        <svg {...baseProps} {...props}>
          <path d="M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      );

    case 'shirt':
      return (
        <svg {...baseProps} {...props}>
          <path d="M9 2L4 6l2 2 1-1v13h10V7l1 1 2-2-5-4" />
          <path d="M9 2c.8 1.3 1.8 2 3 2s2.2-.7 3-2" />
        </svg>
      );

    case 'gamepad':
      return (
        <svg {...baseProps} {...props}>
          <rect x="2" y="6" width="20" height="12" rx="3" />
          <path d="M8 10v4" />
          <path d="M6 12h4" />
          <circle cx="16" cy="10" r="0.8" fill="currentColor" />
          <circle cx="18" cy="12" r="0.8" fill="currentColor" />
        </svg>
      );

    case 'target':
      return (
        <svg {...baseProps} {...props}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" />
        </svg>
      );

    case 'alert-triangle':
      return (
        <svg {...baseProps} {...props}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4" />
          <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );

    case 'pie-chart':
      return (
        <svg {...baseProps} {...props}>
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      );

    case 'bank':
      return (
        <svg {...baseProps} {...props}>
          <path d="M3 21h18" />
          <path d="M3 10h18" />
          <path d="M12 3l9 7H3l9-7z" />
          <path d="M5 10v8" />
          <path d="M9.5 10v8" />
          <path d="M14.5 10v8" />
          <path d="M19 10v8" />
        </svg>
      );

    case 'pencil':
      return (
        <svg {...baseProps} {...props}>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );

    case 'chevron-left':
      return (
        <svg {...baseProps} {...props}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      );

    case 'chevron-right':
      return (
        <svg {...baseProps} {...props}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      );

    case 'income':
      return (
        <svg {...baseProps} {...props}>
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
      );

    case 'sun':
      return (
        <svg {...baseProps} {...props}>
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      );

    case 'moon':
      return (
        <svg {...baseProps} {...props}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );

    case 'calendar':
      return (
        <svg {...baseProps} {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );

    case 'chevron-down':
      return (
        <svg {...baseProps} {...props}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );

    case 'credit-card':
      return (
        <svg {...baseProps} {...props}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      );

    case 'cash':
      return (
        <svg {...baseProps} {...props}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="3" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
      );

    case 'transfer':
      return (
        <svg {...baseProps} {...props}>
          <path d="M17 1l4 4-4 4" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <path d="M7 23l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      );

    case 'coffee':
      return (
        <svg {...baseProps} {...props}>
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <path d="M6 1v3M10 1v3M14 1v3" />
        </svg>
      );

    case 'shopping-bag':
      return (
        <svg {...baseProps} {...props}>
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );

    case 'trending-down':
      return (
        <svg {...baseProps} {...props}>
          <path d="M23 18l-9.5-9.5-5 5L1 6" />
          <path d="M17 18h6v-6" />
        </svg>
      );

    default:
      return (
        <svg {...baseProps} {...props}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}
