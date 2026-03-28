export const theme = {
  // Sidebar (stays dark)
  sidebar: {
    bg: '#242428',
    bgHover: '#2e2e32',
    border: '#3a3a3f',
    text: '#e4e4e7',
    textMuted: '#a1a1aa',
    textDim: '#71717a',
    sectionLabel: '#6b6b73',
    activeBg: 'linear-gradient(90deg, rgba(99,102,241,0.15), transparent)',
    activeBorder: '#6366f1',
  },

  // Main content area (light)
  main: {
    bg: '#f0f0f3',
    card: '#ffffff',
    cardBorder: '#e0e0e5',
    inputBg: '#ffffff',
    inputBorder: '#d0d0d5',
    tableHeaderBg: '#f7f7f9',
    tableRowBorder: '#e8e8ec',
    hoverBg: '#f7f7f9',
  },

  // Text (for main content area)
  text: {
    primary: '#1c1c1e',
    secondary: '#6b6b73',
    dim: '#8a8a8f',
    heading: '#111113',
    placeholder: '#9a9aa0',
  },

  // Accent
  accent: '#6366f1',
  accentHover: '#5558e6',
  accentLight: 'rgba(99,102,241,0.1)',

  // Status
  status: {
    running: '#22c55e',
    runningBg: '#ecfdf5',
    stopped: '#71717a',
    stoppedBg: '#f4f4f5',
    migrating: '#f59e0b',
    migratingBg: '#fffbeb',
    error: '#ef4444',
    errorBg: '#fef2f2',
    provisioning: '#3b82f6',
    provisioningBg: '#eff6ff',
  },

  // Top bar
  topBar: {
    bg: '#ffffff',
    border: '#e0e0e5',
    searchBg: '#f0f0f3',
    searchBorder: '#d0d0d5',
  },

  // Buttons
  button: {
    primary: '#6366f1',
    primaryText: '#ffffff',
    secondary: '#ffffff',
    secondaryBorder: '#d0d0d5',
    secondaryText: '#1c1c1e',
    danger: '#ef4444',
    dangerText: '#ffffff',
  },

  // Modal / Slide-over
  modal: {
    overlay: 'rgba(0, 0, 0, 0.4)',
    bg: '#ffffff',
    border: '#e0e0e5',
    headerBg: '#ffffff',
    headerBorder: '#e0e0e5',
    footerBg: '#f7f7f9',
    footerBorder: '#e0e0e5',
  },

  // Login page (dark)
  login: {
    bg: '#1c1c1e',
    card: '#2a2a2e',
    cardBorder: '#3a3a3f',
    inputBg: '#323236',
    inputBorder: '#3a3a3f',
    text: '#e4e4e7',
    textMuted: '#a1a1aa',
  },

  // Console (dark)
  console: {
    bg: '#000000',
    headerBg: '#ffffff',
    headerBorder: '#e0e0e5',
  },

  // Misc
  radius: {
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
  },
} as const

export type Theme = typeof theme
