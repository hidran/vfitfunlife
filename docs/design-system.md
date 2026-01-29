# Design System - V Fitness

## Brand Identity

### Logo
- **Primary Logo:** Gradient "V" with cyan → purple → yellow flow
- **Wordmark:** "Vfitfunlife" in gradient colors
- **Icon:** Simplified "V" for app icon and favicons

### Tagline
"Connect, Train, Transform" / #DOitDIFFERENTLY

---

## Color System

### Section-Based Theming

The app uses **context-aware theming** where colors change based on the active section (VFit, VFun, VLife).

#### VFit (Fitness) - Blue/Cyan Theme
```css
--vfit-primary: #00C9FF;        /* Cyan blue */
--vfit-secondary: #0066FF;      /* Deep blue */
--vfit-accent: #7B61FF;         /* Purple accent */
--vfit-gradient: linear-gradient(135deg, #00C9FF 0%, #0066FF 50%, #7B61FF 100%);
```

#### VFun (Entertainment) - Purple/Magenta Theme
```css
--vfun-primary: #B461FF;        /* Vibrant purple */
--vfun-secondary: #FF00E5;      /* Magenta */
--vfun-accent: #FF6B9D;         /* Pink accent */
--vfun-gradient: linear-gradient(135deg, #B461FF 0%, #FF00E5 50%, #FF6B9D 100%);
```

#### VLife (Wellness) - Green/Yellow Theme
```css
--vlife-primary: #00E676;       /* Fresh green */
--vlife-secondary: #76FF03;     /* Lime green */
--vlife-accent: #FFD600;        /* Yellow accent */
--vlife-gradient: linear-gradient(135deg, #00E676 0%, #76FF03 50%, #FFD600 100%);
```

### Neutral Colors
```css
--background: #FFFFFF;
--background-secondary: #F5F7FA;
--background-tertiary: #EDF0F5;

--text-primary: #1A1D29;
--text-secondary: #6B7280;
--text-tertiary: #9CA3AF;
--text-inverse: #FFFFFF;

--border: #E5E7EB;
--border-light: #F3F4F6;

--overlay: rgba(0, 0, 0, 0.5);
--overlay-light: rgba(0, 0, 0, 0.2);
```

### Semantic Colors
```css
--success: #10B981;
--success-light: #D1FAE5;
--warning: #F59E0B;
--warning-light: #FEF3C7;
--error: #EF4444;
--error-light: #FEE2E2;
--info: #3B82F6;
--info-light: #DBEAFE;
```

### VIP Gold
```css
--vip-gold: #FFD700;
--vip-gold-light: #FFF9E6;
--vip-gradient: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
```

---

## Typography

### Font Families
```css
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-display: 'Poppins', 'Inter', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Type Scale (Mobile-First)
```css
/* Headings */
--text-4xl: 2.5rem;      /* 40px - Hero titles */
--text-3xl: 2rem;        /* 32px - Page titles */
--text-2xl: 1.5rem;      /* 24px - Section titles */
--text-xl: 1.25rem;      /* 20px - Card titles */
--text-lg: 1.125rem;     /* 18px - Subheadings */

/* Body */
--text-base: 1rem;       /* 16px - Body text */
--text-sm: 0.875rem;     /* 14px - Secondary text */
--text-xs: 0.75rem;      /* 12px - Captions, labels */

/* Line Heights */
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.75;

/* Font Weights */
--font-light: 300;
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
--font-extrabold: 800;
```

### Text Styles
```typescript
// Usage examples
.heading-1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  line-height: var(--leading-tight);
}

.heading-2 {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: var(--font-semibold);
  line-height: var(--leading-tight);
}

.body-large {
  font-family: var(--font-primary);
  font-size: var(--text-lg);
  font-weight: var(--font-normal);
  line-height: var(--leading-normal);
}

.body {
  font-family: var(--font-primary);
  font-size: var(--text-base);
  font-weight: var(--font-normal);
  line-height: var(--leading-normal);
}

.caption {
  font-family: var(--font-primary);
  font-size: var(--text-sm);
  font-weight: var(--font-normal);
  line-height: var(--leading-normal);
  color: var(--text-secondary);
}
```

---

## Spacing System

### Base Unit: 4px
```css
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-20: 5rem;     /* 80px */
```

### Container Padding
```css
--container-padding-mobile: var(--space-4);   /* 16px */
--container-padding-tablet: var(--space-6);   /* 24px */
--container-padding-desktop: var(--space-8);  /* 32px */
```

---

## Border Radius

```css
--radius-sm: 0.375rem;    /* 6px - Small elements */
--radius-md: 0.5rem;      /* 8px - Cards, inputs */
--radius-lg: 0.75rem;     /* 12px - Modals, sheets */
--radius-xl: 1rem;        /* 16px - Hero cards */
--radius-2xl: 1.5rem;     /* 24px - Special cards */
--radius-full: 9999px;    /* Pills, avatars */
```

---

## Shadows

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
--shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
```

---

## Component Library

### Buttons

#### Primary Button
```tsx
<button className="btn-primary">
  Book Now
</button>

// Styles
.btn-primary {
  padding: 12px 24px;
  background: var(--section-primary);  /* Changes with section */
  color: white;
  border-radius: var(--radius-md);
  font-weight: var(--font-semibold);
  font-size: var(--text-base);
  min-height: 44px;  /* Touch target */
  box-shadow: var(--shadow-md);
  transition: all 0.2s ease;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
}

.btn-primary:active {
  transform: translateY(0);
  box-shadow: var(--shadow-sm);
}
```

#### Secondary Button
```tsx
<button className="btn-secondary">
  Learn More
</button>

.btn-secondary {
  padding: 12px 24px;
  background: transparent;
  color: var(--section-primary);
  border: 2px solid var(--section-primary);
  border-radius: var(--radius-md);
  font-weight: var(--font-semibold);
  min-height: 44px;
}
```

#### Ghost Button
```tsx
<button className="btn-ghost">
  Cancel
</button>

.btn-ghost {
  padding: 12px 24px;
  background: transparent;
  color: var(--text-secondary);
  border: none;
}
```

### Cards

#### Basic Card
```tsx
<div className="card">
  <img src="..." alt="..." className="card-image" />
  <div className="card-content">
    <h3 className="card-title">Title</h3>
    <p className="card-description">Description</p>
  </div>
</div>

.card {
  background: white;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-md);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-xl);
}

.card-image {
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
}

.card-content {
  padding: var(--space-4);
}
```

#### Venue Card
```tsx
<div className="venue-card">
  <img src="..." className="venue-image" />
  <div className="venue-badge">Partner</div>
  <div className="venue-content">
    <h3>Gym Name</h3>
    <div className="venue-rating">
      ⭐ 4.8 (124)
    </div>
    <p className="venue-distance">2.3 km</p>
  </div>
</div>
```

### Inputs

```tsx
<div className="input-group">
  <label className="input-label">Email</label>
  <input
    type="email"
    className="input"
    placeholder="your@email.com"
  />
  <span className="input-error">Invalid email</span>
</div>

.input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  min-height: 44px;
  transition: border-color 0.2s ease;
}

.input:focus {
  outline: none;
  border-color: var(--section-primary);
  box-shadow: 0 0 0 3px rgba(var(--section-primary-rgb), 0.1);
}

.input-error {
  display: block;
  margin-top: var(--space-1);
  color: var(--error);
  font-size: var(--text-sm);
}
```

### Badges

```tsx
<span className="badge badge-vip">VIP</span>
<span className="badge badge-partner">Partner</span>
<span className="badge badge-success">Confirmed</span>

.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-vip {
  background: var(--vip-gold-light);
  color: var(--vip-gold);
}

.badge-partner {
  background: var(--info-light);
  color: var(--info);
}
```

### Avatars

```tsx
<img src="..." className="avatar avatar-md" alt="User" />

.avatar {
  border-radius: var(--radius-full);
  object-fit: cover;
}

.avatar-sm { width: 32px; height: 32px; }
.avatar-md { width: 48px; height: 48px; }
.avatar-lg { width: 64px; height: 64px; }
.avatar-xl { width: 96px; height: 96px; }
```

### Rating Stars

```tsx
<div className="rating">
  <span className="rating-stars">★★★★☆</span>
  <span className="rating-value">4.5</span>
  <span className="rating-count">(124)</span>
</div>

.rating {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.rating-stars {
  color: #FFD700;
  font-size: var(--text-lg);
}

.rating-value {
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}

.rating-count {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}
```

---

## Icons

### Icon Library
Using **Lucide React** for consistent, customizable icons.

```tsx
import { Home, Search, Calendar, User, MapPin, Star } from 'lucide-react';

<Home size={24} strokeWidth={2} />
```

### Icon Sizes
- **sm:** 16px - Inline with text
- **md:** 20px - Buttons, list items
- **lg:** 24px - Navigation, headers
- **xl:** 32px - Feature highlights

---

## Animations & Transitions

### Timing Functions
```css
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### Duration
```css
--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 350ms;
```

### Common Animations

#### Fade In
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.fade-in {
  animation: fadeIn var(--duration-normal) var(--ease-out);
}
```

#### Slide Up
```css
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.slide-up {
  animation: slideUp var(--duration-normal) var(--ease-out);
}
```

#### Shake (Error Feedback)
```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-10px); }
  75% { transform: translateX(10px); }
}

.shake {
  animation: shake var(--duration-normal) var(--ease-out);
}
```

---

## Responsive Breakpoints

```css
/* Mobile First */
@media (min-width: 640px) { /* sm - Large phones */ }
@media (min-width: 768px) { /* md - Tablets */ }
@media (min-width: 1024px) { /* lg - Small laptops */ }
@media (min-width: 1280px) { /* xl - Desktop */ }
@media (min-width: 1536px) { /* 2xl - Large desktop */ }
```

---

## Touch Targets & Accessibility

### Minimum Sizes
- **Touch targets:** 44x44px minimum
- **Text links:** 48x48px tap area with padding
- **Icons:** 24px with 44x44px interactive area

### Focus States
```css
.focusable:focus-visible {
  outline: 3px solid var(--section-primary);
  outline-offset: 2px;
}
```

### ARIA Labels
Always include for icon-only buttons:
```tsx
<button aria-label="Close menu">
  <X size={24} />
</button>
```

---

## Dark Mode (Future)

Prepared for dark mode support:
```css
@media (prefers-color-scheme: dark) {
  :root {
    --background: #1A1D29;
    --text-primary: #F9FAFB;
    /* ... */
  }
}
```
