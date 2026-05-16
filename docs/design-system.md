# VFit Design System

## Overview

VFit is a mobile-first fitness and wellness platform with a section-based theming system (Fit/Fun/Life). The design system uses Tailwind CSS v4 with CSS custom properties for dynamic theming.

## Brand Identity

### Logo
- **Primary Logo:** Gradient "V" with cyan → purple → yellow flow
- **Wordmark:** "Vfitfunlife" in gradient colors
- **Icon:** Simplified "V" for app icon and favicons

### Tagline
"Connect, Train, Transform" / #DOitDIFFERENTLY

## Canonical Source

The runtime source of truth for visual tokens is:

- `src/styles/globals.css` (`@theme` tokens + `data-section` variables)

Wireframe files under `docs/wireframe/` are reference layouts and interaction direction. When a wireframe color differs from token values, token values in `globals.css` take precedence.

---

## Available UI Components

### Core Components (`src/components/ui/`)

| Component | File | Description | Key Props |
|-----------|------|-------------|-----------|
| **Button** | `button.tsx` | Primary action button with variants | `variant`, `size`, `isLoading`, `fullWidth` |
| **Card** | `Card.tsx` | Container with sub-components | `hoverable`, `padding` |
| **CardImage** | `Card.tsx` | Image with aspect ratio presets | `aspectRatio` (16/9, 4/3, 1/1) |
| **CardContent** | `Card.tsx` | Content padding wrapper | - |
| **CardHeader** | `Card.tsx` | Header section | - |
| **CardTitle** | `Card.tsx` | Title typography | - |
| **CardDescription** | `Card.tsx` | Description text | - |
| **CardFooter** | `Card.tsx` | Footer section | - |
| **Input** | `input.tsx` | Text input with icons/label | `label`, `error`, `leftIcon`, `rightIcon` |
| **Badge** | `Badge.tsx` | Status/label badges | `variant`, `size` |
| **Avatar** | `Avatar.tsx` | User avatar with fallback | `src`, `name`, `size` |
| **AvatarGroup** | `Avatar.tsx` | Stacked avatar group | `max` |
| **IconButton** | `IconButton.tsx` | Icon-only button | `icon`, `variant`, `size`, `aria-label` (required) |
| **Rating** | `Rating.tsx` | Star rating display | `value`, `count`, `size` |
| **Spinner** | `Spinner.tsx` | Loading spinner | `size`, `gradient` |
| **Checkbox** | `checkbox.tsx` | Checkbox with label | `label`, `error` |
| **OtpInput** | `otp-input.tsx` | 6-digit OTP input | `length`, `value`, `onChange`, `onComplete` |
| **SectionSelector** | `section-selector.tsx` | Fit/Fun/Life selector | `value`, `onChange`, `error` |
| **SectionSwitcher** | `section-switcher.tsx` | Compact section toggle | - |
| **Divider** | `divider.tsx` | Horizontal divider with optional text | `text` |
| **CountryCodePicker** | `country-code-picker.tsx` | Phone country selector | `value`, `onChange` |
| **Modal** | `Modal.tsx` | Modal/dialog overlay | `isOpen`, `onClose`, `title`, `size` |

### Layout Components (`src/components/layout/`)

| Component | Description |
|-----------|-------------|
| **MainLayout** | App shell with Header + TabBar |
| **Header** | Fixed header with section switcher |
| **TabBar** | Bottom navigation (Home, Search, Bookings, Profile) |
| **SideDrawer** | Slide-in drawer for secondary navigation/menus |

### Card Components (`src/components/cards/`)

| Component | Description | Variants |
|-----------|-------------|----------|
| **FeatureCard** | Service/feature display | `default`, `horizontal`, `hero` |
| **ServiceCategoryCard** | Category grid item | `default`, `compact` |
| **TestimonialCard** | User review card | - |

---

## Color System

### Section-Based Theming

The app uses CSS custom properties that change based on the active section:

```css
/* Fit (Fitness) - Blue/Cyan */
--color-vfit-primary: #00C9FF;
--color-vfit-secondary: #0066FF;
--color-vfit-accent: #7B61FF;

/* Fun (Entertainment) - Purple/Magenta */
--color-vfun-primary: #B461FF;
--color-vfun-secondary: #FF00E5;
--color-vfun-accent: #FF6B9D;

/* Life (Wellness) - Green/Yellow */
--color-vlife-primary: #00E676;
--color-vlife-secondary: #76FF03;
--color-vlife-accent: #FFD600;
```

### Dynamic Section Variables

```css
--section-primary    /* Changes based on active section */
--section-secondary  /* Changes based on active section */
--section-accent     /* Changes based on active section */
--section-gradient   /* Linear gradient for active section */
```

### Usage in Components

```tsx
// Text color
className="text-section-primary"

// Background color
className="bg-section-primary"

// Border color
className="border-section-primary"

// Gradient background
className="bg-section-gradient"
```

### Neutral Colors

| Token | Value | Usage |
|-------|-------|-------|
| `bg-background-dark` | `#1A1D29` | App background |
| `bg-background-secondary` | `#F5F7FA` | Light backgrounds |
| `bg-background-tertiary` | `#EDF0F5` | Subtle backgrounds |
| `text-text-primary` | `#1A1D29` | Primary text (light bg) |
| `text-text-secondary` | `#6B7280` | Secondary text |
| `text-text-tertiary` | `#9CA3AF` | Muted text |
| `text-text-inverse` | `#FFFFFF` | Text on dark bg |
| `border-DEFAULT` | `#E5E7EB` | Default borders |

### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| `success-DEFAULT` | `#10B981` | Success states |
| `warning-DEFAULT` | `#F59E0B` | Warning states |
| `error-DEFAULT` | `#EF4444` | Error states |
| `info-DEFAULT` | `#3B82F6` | Info states |
| `vip-gold` | `#FFD700` | VIP/premium features |

---

## Typography

### Font Families

```css
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
--font-display: "Poppins", "Inter", sans-serif;  /* Headings */
--font-mono: "JetBrains Mono", "Fira Code", monospace;
```

### Type Scale

| Size | Value | Line Height | Usage |
|------|-------|-------------|-------|
| `4xl` | 2.5rem | 1.25 | Hero titles |
| `3xl` | 2rem | 1.25 | Page titles |
| `2xl` | 1.5rem | 1.25 | Section headers |
| `xl` | 1.25rem | 1.25 | Card titles |
| `lg` | 1.125rem | 1.5 | Subheadings |
| `base` | 1rem | 1.5 | Body text |
| `sm` | 0.875rem | 1.5 | Secondary text |
| `xs` | 0.75rem | 1.5 | Captions, labels |

### Typography Patterns

```tsx
// Page title
<h1 className="text-2xl font-display font-bold">

// Section heading
<h2 className="text-lg font-semibold text-text-inverse">

// Card title
<h3 className="text-xl font-semibold text-[#1A1D29]">

// Body text
<p className="text-sm text-text-secondary leading-relaxed">

// Caption/label
<span className="text-xs text-text-tertiary">
```

---

## Spacing System

| Token | Value |
|-------|-------|
| `spacing-1` | 0.25rem (4px) |
| `spacing-2` | 0.5rem (8px) |
| `spacing-3` | 0.75rem (12px) |
| `spacing-4` | 1rem (16px) |
| `spacing-5` | 1.25rem (20px) |
| `spacing-6` | 1.5rem (24px) |
| `spacing-8` | 2rem (32px) |
| `spacing-10` | 2.5rem (40px) |
| `spacing-12` | 3rem (48px) |

### Common Spacing Patterns

```tsx
// Card padding
className="p-4"      // Standard card padding
className="p-6"      // Large card padding

// Section spacing
className="space-y-8"  // Between sections
className="gap-4"      // Grid gaps

// Container padding
className="px-4 sm:px-6 lg:px-8"  // Responsive container
```

---

## Common Styling Patterns

### Card Patterns

```tsx
// Dark card (on dark background)
className="rounded-2xl border border-white/10 bg-white/5"

// Hoverable card
className="rounded-2xl border border-white/10 bg-white/5 
           hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10 
           transition-all duration-200"

// Glass card
className="glass rounded-2xl border border-white/10"

// Quick action card
className="group rounded-2xl border border-white/10 bg-white/5 p-4 
           transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10"
```

### Button Patterns

```tsx
// Primary button (uses section gradient)
<Button variant="primary" size="md">

// Secondary/outline button
<Button variant="outline" size="md">

// Ghost button
<Button variant="ghost" size="sm">

// Social/login button
<Button variant="social" size="lg">
```

### Input Patterns

```tsx
// Standard input
<Input label="Email" placeholder="Enter email" />

// Input with icon
<Input leftIcon={<Mail />} placeholder="Search..." />

// Input with error
<Input error="This field is required" />
```

### Badge Patterns

```tsx
// VIP badge
<Badge variant="vip">VIP</Badge>

// Partner badge
<Badge variant="partner">Partner</Badge>

// Status badges
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="error">Failed</Badge>
```

---

## Responsive Design Patterns

### Mobile-First Approach

All designs are mobile-first with progressive enhancement:

```tsx
// Mobile default, larger screens get more padding
className="px-4 sm:px-6 lg:px-8"

// Touch targets (44px minimum)
className="min-h-[44px] min-w-[44px]"

// Responsive grid
className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4"

// Responsive text
className="text-sm md:text-base"
```

### Container Pattern

```tsx
// Standard mobile container
className="container-mobile"  // Equivalent to px-4 sm:px-6 lg:px-8

// Content max-width
className="max-w-md mx-auto"  // Mobile-first max-width
```

### Safe Area Support

```tsx
// For fixed headers
className="pt-safe"  // padding-top: env(safe-area-inset-top)

// For fixed footers
className="pb-safe"  // padding-bottom: env(safe-area-inset-bottom)

// Combined with fixed heights
style={{
  paddingTop: 'calc(var(--safe-area-inset-top) + 56px)',
  paddingBottom: 'calc(var(--safe-area-inset-bottom) + 80px)',
}}
```

---

## Animation & Transition Patterns

### Timing Variables

```css
--duration-fast: 150ms;    /* Micro-interactions */
--duration-normal: 250ms;  /* Standard transitions */
--duration-slow: 350ms;    /* Emphasis animations */
```

### Predefined Animations

```css
animate-fade-in     /* Opacity fade in */
animate-slide-up    /* Slide up + fade */
animate-slide-down  /* Slide down + fade */
animate-shake       /* Error shake */
animate-pulse-slow  /* Subtle pulse (3s) */
```

### Common Transition Patterns

```tsx
// Button press feedback
className="active:scale-[0.98] transition-transform duration-200"

// Card hover lift
className="hover:-translate-y-1 hover:shadow-xl transition-all duration-200"

// Color transitions
className="transition-colors duration-200"

// Input focus
className="focus:ring-2 focus:ring-section-primary focus:border-transparent 
           transition-all duration-200"
```

### Loading States

```tsx
// Skeleton placeholder
className="animate-pulse bg-white/10 rounded"

// Spinner
<Spinner size="md" gradient />

// Button loading
<Button isLoading>Submit</Button>
```

---

## Layout Patterns

### App Shell Structure

```
MainLayout
├── Header (fixed, 56px + safe area)
│   └── Section Switcher
├── Main Content (flex-1, scrollable)
│   └── page content
└── TabBar (fixed, 64px + safe area)
```

### Page Structure Pattern

```tsx
<main className="container-mobile py-6 space-y-8">
  {/* Section with header */}
  <section>
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold text-text-inverse">Title</h3>
      <Link className="text-sm font-medium text-section-primary">View all</Link>
    </div>
    {/* Content */}
  </section>
</main>
```

### Horizontal Scroll Pattern

```tsx
<div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
  {items.map(item => (
    <div key={item.id} className="min-w-[220px]">
      {/* Card content */}
    </div>
  ))}
</div>
```

### Grid Pattern

```tsx
// 2-column grid for quick actions
<div className="grid grid-cols-2 gap-4">
  {actions.map(action => <QuickActionCard key={action.id} />)}
</div>
```

---

## Component Decision Guide

### When to Use Existing Components

| Scenario | Component | Example |
|----------|-----------|---------|
| Primary CTA | `Button` with `variant="primary"` | "Book Now", "Continue" |
| Secondary action | `Button` with `variant="outline"` | "Cancel", "Back" |
| Icon-only action | `IconButton` | Close button, settings |
| User display | `Avatar` | Profile pictures, user lists |
| Status indicator | `Badge` | "VIP", "Partner", "New" |
| Star rating | `Rating` | Venue ratings, reviews |
| Loading state | `Spinner` | Page loads, form submission |
| Form input | `Input` | Text fields, search |
| Selection | `Checkbox` | Terms agreement, filters |
| Card container | `Card` | Content containers |

### When to Create New Components

**Create a new component when:**

1. **Domain-specific logic** - Business logic tied to a specific feature (e.g., `GymCard`, `BookingTimeline`)
2. **Complex composition** - Multiple UI components composed with specific layout
3. **Reused across pages** - Pattern used in 3+ places
4. **Unique interactions** - Custom animations or behaviors

**Extend existing components when:**

1. **Visual variation only** - Use props/classes (e.g., `variant`, `size`, `className`)
2. **Slight layout change** - Compose with existing sub-components
3. **Single-use pattern** - Inline in page/component

### Component Hierarchy

```
Page
├── Layout Components (Header, TabBar, MainLayout)
├── Domain Components (FeatureCard, ServiceCategoryCard)
│   └── UI Components (Card, Badge, Button)
└── Primitive Components (from src/components/ui/)
    └── HTML + Tailwind classes
```

---

## Best Practices

### Tailwind Class Ordering

1. **Layout** - `flex`, `grid`, `block`, `hidden`
2. **Sizing** - `w-`, `h-`, `min-w-`, `max-h-`
3. **Spacing** - `p-`, `m-`, `gap-`, `space-y-`
4. **Typography** - `text-`, `font-`, `leading-`
5. **Colors** - `bg-`, `text-`, `border-`
6. **Effects** - `shadow-`, `rounded-`, `opacity-`
7. **Interactions** - `hover:`, `focus:`, `active:`, `disabled:`
8. **Transitions** - `transition-`, `duration-`, `ease-`

### Using the `cn()` Utility

Always use the `cn()` utility for class merging:

```tsx
import { cn } from '@/lib/utils';

className={cn(
  // Base styles
  'rounded-xl border border-white/10',
  // Conditional styles
  isActive && 'bg-section-primary',
  // Size variants
  size === 'sm' ? 'p-2' : 'p-4',
  // External classes last
  className
)}
```

### Accessibility

- All interactive elements must have minimum 44x44px touch target
- Use `aria-label` for icon-only buttons
- Support focus-visible states
- Maintain color contrast ratios
- Test with screen readers

### Performance

- Use `will-change` sparingly for animations
- Prefer `transform` and `opacity` for animations
- Use `content-visibility` for off-screen content
- Lazy load images below the fold
