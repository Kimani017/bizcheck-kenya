// Line-art icon set for BizCheck. All icons inherit their color from the
// parent element (stroke="currentColor"), so active/inactive states just
// work by setting color on the button.
// Usage: <Icon.Home size={22} />  or  <Icon.Market />

function Svg({ size = 22, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

const Icon = {
  // ── Main navigation ────────────────────────────────────────────────
  Home: (p) => (
    <Svg {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5" />
    </Svg>
  ),

  Feed: (p) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h6M7 13h10M7 17h7" />
    </Svg>
  ),

  Market: (p) => (
    <Svg {...p}>
      <path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" />
      <path d="M3 7.5v9L12 21l9-4.5v-9" />
      <path d="M12 12v9" />
    </Svg>
  ),

  Report: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6 18.4 18.4" />
    </Svg>
  ),

  Messages: (p) => (
    <Svg {...p}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.3 9.3 0 0 1-3.3-.6L3 21l1.8-5a8.2 8.2 0 0 1-.8-3.5 8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8 7.4Z" />
    </Svg>
  ),

  Profile: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </Svg>
  ),

  Business: (p) => (
    <Svg {...p}>
      <path d="M4 21V6.5L12 3l8 3.5V21" />
      <path d="M3 21h18" />
      <path d="M9.5 21v-5h5v5" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
    </Svg>
  ),

  // ── Business dashboard subtabs ────────────────────────────────────
  Store: (p) => (
    <Svg {...p}>
      <path d="M4 9h16l-1 11.5a1 1 0 0 1-1 .9H6a1 1 0 0 1-1-.9L4 9Z" />
      <path d="M8.5 9V6a3.5 3.5 0 0 1 7 0v3" />
    </Svg>
  ),

  Dashboard: (p) => (
    <Svg {...p}>
      <path d="M3 20h18" />
      <rect x="5" y="12" width="3.5" height="8" rx="0.7" />
      <rect x="10.2" y="7" width="3.5" height="13" rx="0.7" />
      <rect x="15.5" y="14.5" width="3.5" height="5.5" rx="0.7" />
    </Svg>
  ),

  Details: (p) => (
    <Svg {...p}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </Svg>
  ),

  Activities: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.4 2" />
    </Svg>
  ),

  // ── Store page tabs ───────────────────────────────────────────────
  Grid: (p) => (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </Svg>
  ),

  Info: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6h.01" />
    </Svg>
  ),

  // ── Actions ───────────────────────────────────────────────────────
  Camera: (p) => (
    <Svg {...p}>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.8l1.3-2h6.8l1.3 2h2.8A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.4" />
    </Svg>
  ),

  Like: (p) => (
    <Svg {...p}>
      <path d="M7 21V10l4.2-7a2.2 2.2 0 0 1 2 3.1L12 10h5.6a2.3 2.3 0 0 1 2.2 2.9l-1.7 6.4A2.3 2.3 0 0 1 15.9 21H7Z" />
      <path d="M7 10H4.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H7" />
    </Svg>
  ),

  Comment: (p) => (
    <Svg {...p}>
      <path d="M20.5 11.5a7.6 7.6 0 0 1-8.2 7.6 8.6 8.6 0 0 1-2.9-.5L4.5 20.5l1.5-4.4a7.5 7.5 0 0 1-.7-3.2 7.6 7.6 0 0 1 8.2-7.6 7.6 7.6 0 0 1 7 6.2Z" />
    </Svg>
  ),

  Save: (p) => (
    <Svg {...p}>
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2L5.5 20.5v-16a1 1 0 0 1 1-1Z" />
    </Svg>
  ),

  Search: (p) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8 20.5 20.5" />
    </Svg>
  ),

  Menu: (p) => (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  ),

  Bell: (p) => (
    <Svg {...p}>
      <path d="M18 9a6 6 0 0 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9Z" />
      <path d="M13.7 19a2 2 0 0 1-3.4 0" />
    </Svg>
  ),

  Eye: (p) => (
    <Svg {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),

  Plus: (p) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),

  Trash: (p) => (
    <Svg {...p}>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" />
      <path d="M6 7l.9 12.1a1 1 0 0 0 1 .9h8.2a1 1 0 0 0 1-.9L18 7" />
    </Svg>
  ),

  Download: (p) => (
    <Svg {...p}>
      <path d="M12 3.5v11" />
      <path d="M8 11l4 4 4-4" />
      <path d="M4.5 19.5h15" />
    </Svg>
  ),
}

export default Icon
