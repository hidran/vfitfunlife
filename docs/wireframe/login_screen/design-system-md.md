# Design System

## Brand Identity

**App Name:** V (stylized as a checkmark/victory symbol)
**Tagline:** FIT • FUN • LIFE
**Personality:** Energetic, Premium, Trustworthy, Modern

---

## Color System

### Section Themes
Each section has its own color identity that transforms the UI:

```typescript
const sectionColors = {
  fit: {
    primary: '#10B981',          // Emerald 500
    primaryDark: '#059669',      // Emerald 600
    gradient: 'from-emerald-500 to-teal-600',
    gradientRGB: 'linear-gradient(135deg, #10B981 0%, #0D9488 100%)',
    light: '#D1FAE5',            // Emerald 100
    surface: 'rgba(16, 185, 129, 0.1)',
  },
  fun: {
    primary: '#F97316',          // Orange 500
    primaryDark: '#EA580C',      // Orange 600
    gradient: 'from-orange-500 to-pink-600',
    gradientRGB: 'linear-gradient(135deg, #F97316 0%, #DB2777 100%)',
    light: '#FFEDD5',            // Orange 100
    surface: 'rgba(249, 115, 22, 0.1)',
  },
  life: {
    primary: '#8B5CF6',          // Violet 500
    primaryDark: '#7C3AED',      // Violet 600
    gradient: 'from-purple-500 to-indigo-600',
    gradientRGB: 'linear-gradient(135deg, #8B5CF6 0%, #4F46E5 100%)',
    light: '#EDE9FE',            // Violet 100
    surface: 'rgba(139, 92, 246, 0.1)',
  },
};
```

### VIP Theme
```typescript
const vipColors = {
  primary: '#F59E0B',            // Amber 500
  secondary: '#D97706',          // Amber 600
  gradient: 'from-amber-400 to-orange-500',
  surface: 'rgba(245, 158, 11, 0.1)',
  border: 'rgba(245, 158, 11, 0.3)',
};
```

### Base Colors (Dark Theme)
```typescript
const baseColors = {
  // Backgrounds
  background: '#0F172A',         // Slate 900
  backgroundAlt: '#1E293B',      // Slate 800
  surface: 'rgba(255, 255, 255, 0.05)',
  surfaceHover: 'rgba(255, 255, 255, 0.08)',
  surfaceActive: 'rgba(255, 255, 255, 0.12)',
  
  // Borders
  border: 'rgba(255, 255, 255, 0.1)',
  borderHover: 'rgba(255, 255, 255, 0.2)',
  
  // Text
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.7)',
  textMuted: 'rgba(255, 255, 255, 0.5)',
  textDisabled: 'rgba(255, 255, 255, 0.3)',
  
  // Status
  success: '#22C55E',            // Green 500
  warning: '#EAB308',            // Yellow 500
  error: '#EF4444',              // Red 500
  info: '#3B82F6',               // Blue 500
  
  // Ratings
  star: '#FBBF24',               // Amber 400
  starEmpty: 'rgba(255, 255, 255, 0.2)',
};
```

---

## Typography

### Font Family
```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-display: 'Plus Jakarta Sans', var(--font-sans);
```

### Type Scale
```typescript
const typography = {
  // Display (for hero sections, splash)
  displayLarge: 'text-6xl font-black tracking-tight',     // 60px
  displayMedium: 'text-5xl font-black tracking-tight',    // 48px
  displaySmall: 'text-4xl font-bold tracking-tight',      // 36px
  
  // Headings
  h1: 'text-3xl font-bold',                               // 30px
  h2: 'text-2xl font-bold',                               // 24px
  h3: 'text-xl font-semibold',                            // 20px
  h4: 'text-lg font-semibold',                            // 18px
  
  // Body
  bodyLarge: 'text-base font-normal',                     // 16px
  bodyMedium: 'text-sm font-normal',                      // 14px
  bodySmall: 'text-xs font-normal',                       // 12px
  
  // Labels
  labelLarge: 'text-sm font-semibold',
  labelMedium: 'text-xs font-semibold',
  labelSmall: 'text-[10px] font-semibold uppercase tracking-wider',
  
  // Special
  price: 'text-2xl font-bold tabular-nums',
  rating: 'text-sm font-semibold tabular-nums',
};
```

---

## Spacing & Layout

### Spacing Scale
Use Tailwind's default spacing (4px base):
- `space-1`: 4px
- `space-2`: 8px
- `space-3`: 12px
- `space-4`: 16px
- `space-5`: 20px
- `space-6`: 24px
- `space-8`: 32px

### Safe Areas (Mobile)
```typescript
const safeAreas = {
  top: 'pt-safe',                // iOS notch
  bottom: 'pb-safe',             // iOS home indicator
  // Use env(safe-area-inset-*) in CSS
};
```

### Container
```typescript
const container = {
  padding: 'px-4',               // 16px horizontal padding
  maxWidth: 'max-w-lg',          // 512px max for mobile-first
  center: 'mx-auto',
};
```

### Touch Targets
Minimum 44x44px for all interactive elements:
```typescript
const touchTarget = 'min-h-[44px] min-w-[44px]';
```

---

## Components

### Cards
```typescript
// Base card
const card = `
  bg-white/5 
  border border-white/10 
  rounded-2xl 
  p-4
  transition-all duration-200
`;

// Interactive card
const cardInteractive = `
  ${card}
  hover:bg-white/8 
  hover:border-white/20
  active:scale-[0.98]
  cursor-pointer
`;

// Elevated card
const cardElevated = `
  ${card}
  shadow-xl shadow-black/20
`;

// Section card (with gradient border)
const cardSection = (section: 'fit' | 'fun' | 'life') => `
  ${card}
  border-${sectionColors[section].primary}/30
  bg-gradient-to-br from-${section}-500/5 to-transparent
`;
```

### Buttons
```typescript
// Primary button (uses section color)
const buttonPrimary = (section: string) => `
  px-6 py-3
  bg-gradient-to-r ${sectionColors[section].gradient}
  text-white font-semibold
  rounded-xl
  shadow-lg shadow-${section}-500/25
  hover:shadow-xl hover:shadow-${section}-500/30
  active:scale-[0.98]
  transition-all duration-200
  disabled:opacity-50 disabled:cursor-not-allowed
`;

// Secondary button
const buttonSecondary = `
  px-6 py-3
  bg-white/10
  text-white font-semibold
  rounded-xl
  border border-white/10
  hover:bg-white/15
  active:scale-[0.98]
  transition-all duration-200
`;

// Ghost button
const buttonGhost = `
  px-4 py-2
  text-white/70
  rounded-lg
  hover:bg-white/10
  hover:text-white
  transition-all duration-200
`;

// Icon button
const buttonIcon = `
  p-3
  rounded-xl
  bg-white/5
  hover:bg-white/10
  transition-all duration-200
`;
```

### Inputs
```typescript
const input = `
  w-full
  px-4 py-3
  bg-white/5
  border border-white/10
  rounded-xl
  text-white
  placeholder:text-white/40
  focus:outline-none
  focus:border-white/30
  focus:ring-2 focus:ring-white/10
  transition-all duration-200
`;

const inputError = `
  ${input}
  border-red-500/50
  focus:border-red-500
  focus:ring-red-500/20
`;
```

### Badges
```typescript
// Status badges
const badge = {
  base: 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold',
  success: 'bg-green-500/20 text-green-400',
  warning: 'bg-amber-500/20 text-amber-400',
  error: 'bg-red-500/20 text-red-400',
  info: 'bg-blue-500/20 text-blue-400',
  vip: 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30',
};

// Section badges
const sectionBadge = (section: string) => `
  ${badge.base}
  bg-${section}-500/20 text-${section}-400
`;
```

### Avatars
```typescript
const avatar = {
  sm: 'w-8 h-8 rounded-full',
  md: 'w-12 h-12 rounded-full',
  lg: 'w-16 h-16 rounded-full',
  xl: 'w-24 h-24 rounded-full',
};

// With gradient border (for VIP)
const avatarVip = `
  p-0.5 rounded-full
  bg-gradient-to-r from-amber-400 to-orange-500
`;
```

### Navigation
```typescript
// Bottom tab bar
const tabBar = `
  fixed bottom-0 left-0 right-0
  bg-slate-900/90 backdrop-blur-xl
  border-t border-white/10
  px-6 py-2 pb-safe
`;

// Tab item
const tabItem = (active: boolean) => `
  flex flex-col items-center gap-1
  py-2 px-4
  ${active ? 'text-white' : 'text-white/50'}
  transition-colors duration-200
`;
```

---

## Animations

### Transitions
```css
/* Default transition */
.transition-default {
  transition: all 200ms ease-out;
}

/* Smooth transition */
.transition-smooth {
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Spring transition */
.transition-spring {
  transition: all 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### Keyframe Animations
```css
/* Fade in up */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Scale in */
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* Pulse glow */
@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 20px rgba(var(--section-color), 0.3); }
  50% { box-shadow: 0 0 40px rgba(var(--section-color), 0.5); }
}

/* Shimmer (for skeletons) */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

### Loading States
```typescript
// Skeleton loader
const skeleton = `
  bg-gradient-to-r from-white/5 via-white/10 to-white/5
  bg-[length:200%_100%]
  animate-shimmer
  rounded-lg
`;

// Spinner
const spinner = `
  w-5 h-5
  border-2 border-white/20
  border-t-white
  rounded-full
  animate-spin
`;
```

---

## Platform-Specific Styles

### iOS
```typescript
// Use SF Pro Display for iOS
const iosFont = '-apple-system, BlinkMacSystemFont';

// iOS-style blur
const iosBlur = 'backdrop-blur-xl bg-white/10';

// Safe area padding
const iosSafeArea = 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]';
```

### Android
```typescript
// Material-style elevation
const androidElevation = 'shadow-lg';

// Status bar height
const androidStatusBar = 'pt-6'; // 24px approximate
```

### Web
```typescript
// Hover states (only on web)
const webHover = 'hover:bg-white/10';

// Scrollbar styling
const webScrollbar = `
  scrollbar-thin
  scrollbar-track-transparent
  scrollbar-thumb-white/20
  hover:scrollbar-thumb-white/30
`;
```

---

## Responsive Breakpoints

```typescript
const breakpoints = {
  sm: '640px',   // Large phones
  md: '768px',   // Tablets
  lg: '1024px',  // Laptops
  xl: '1280px',  // Desktops
};

// Mobile-first approach
// Default styles = mobile
// sm: = large phones and up
// md: = tablets and up
// lg: = desktop only
```

---

## Icons

Use Lucide React icons consistently:
```typescript
import {
  // Navigation
  Home, Search, Calendar, User, Menu, X, ChevronRight, ChevronLeft, ArrowLeft,
  
  // Actions  
  Plus, Minus, Check, Heart, Share, Filter, MapPin, Phone, Mail,
  
  // Sections
  Dumbbell,      // FIT
  PartyPopper,   // FUN
  Sparkles,      // LIFE
  
  // Features
  Star, Clock, Users, Award, Percent, CreditCard, Wallet, Gift,
  
  // Status
  CheckCircle, AlertCircle, Info, Loader,
} from 'lucide-react';

//