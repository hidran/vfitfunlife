# Vercel React Best Practices

## Overview

This guide covers best practices for building React applications with Next.js on the Vercel platform.

## Architecture: Server Components First

### The New Mental Model

```
┌─────────────────────────────────────────────────────────────┐
│  Server Components (Default)                                │
│  - Direct backend access                                    │
│  - Zero JS bundle size                                      │
│  - SEO-friendly                                              │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │  Client    │  │  Client    │  │  Client    │
    │ Component  │  │ Component  │  │ Component  │
    │ (Island 1) │  │ (Island 2) │  │ (Island 3) │
    └────────────┘  └────────────┘  └────────────┘
         'use client' directive
```

### When to Use 'use client'

| Scenario | Use 'use client'? |
|----------|-------------------|
| Data fetching from DB/API | ❌ No - Server Component |
| Using browser APIs (window, localStorage) | ✅ Yes |
| React hooks (useState, useEffect) | ✅ Yes |
| Event handlers (onClick, onSubmit) | ✅ Yes |
| Third-party client libraries | ✅ Yes |
| Static content display | ❌ No - Server Component |
| SEO-critical content | ❌ No - Server Component |

## Project Structure

```
my-app/
├── app/                          # App Router (recommended)
│   ├── layout.tsx               # Root layout (Server Component)
│   ├── page.tsx                 # Home page (Server Component)
│   ├── loading.tsx              # Loading UI
│   ├── error.tsx                # Error UI
│   ├── not-found.tsx            # 404 page
│   ├── (marketing)/             # Route group
│   │   ├── about/
│   │   ├── pricing/
│   │   └── layout.tsx
│   ├── dashboard/               # Dashboard routes
│   │   ├── page.tsx
│   │   ├── settings/
│   │   └── @analytics/          # Parallel route
│   ├── api/                     # API routes
│   └── globals.css
├── components/
│   ├── ui/                      # shadcn/ui components
│   │   ├── button.tsx
│   │   └── card.tsx
│   ├── forms/                   # Form components
│   │   └── contact-form.tsx     # 'use client'
│   └── shared/                  # Shared components
│       └── header.tsx           # Server Component
├── lib/
│   ├── utils.ts
│   └── db.ts                    # Database utilities
├── public/                      # Static assets
└── next.config.js
```

## Data Fetching Patterns

### Server Component (Recommended)

```typescript
// app/users/page.tsx
async function getUsers() {
  const res = await fetch('https://api.example.com/users', {
    next: { revalidate: 3600 } // Revalidate every hour
  });
  return res.json();
}

export default async function UsersPage() {
  const users = await getUsers(); // Fetches on server
  
  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

### With Database (Direct Access)

```typescript
// app/posts/page.tsx
import { db } from '@/lib/db';

export default async function PostsPage() {
  const posts = await db.post.findMany(); // Direct DB access
  
  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.content}</p>
        </article>
      ))}
    </div>
  );
}
```

### Client Component (When Needed)

```typescript
// components/search.tsx
'use client';

import { useState } from 'react';

export function Search() {
  const [query, setQuery] = useState('');
  
  return (
    <input
      type="search"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search..."
    />
  );
}
```

## Caching Strategies

### 1. Static Site Generation (SSG)

```typescript
// Cached indefinitely
export default async function Page() {
  const data = await fetch('https://api.example.com/data');
  return <div>{data}</div>;
}
```

### 2. Incremental Static Regeneration (ISR)

```typescript
// Revalidate every 60 seconds
export default async function Page() {
  const data = await fetch('https://api.example.com/data', {
    next: { revalidate: 60 }
  });
  return <div>{data}</div>;
}
```

### 3. Dynamic Rendering

```typescript
// No caching, render on every request
export default async function Page() {
  const data = await fetch('https://api.example.com/data', {
    cache: 'no-store'
  });
  return <div>{data}</div>;
}
```

### 4. On-Demand Revalidation

```typescript
// app/api/revalidate/route.ts
import { revalidatePath } from 'next/cache';

export async function POST() {
  revalidatePath('/posts');
  return Response.json({ revalidated: true });
}
```

## Image Optimization

```typescript
import Image from 'next/image';

// Automatic optimization
<Image
  src="/hero.jpg"
  width={1200}
  height={600}
  alt="Hero image"
  priority          // Load immediately (above fold)
  quality={85}      // Quality setting (default 75)
/>

// Responsive images
<Image
  src="/photo.jpg"
  alt="Photo"
  sizes="(max-width: 768px) 100vw, 50vw"
  fill              // Fill parent container
  className="object-cover"
/>
```

## Font Optimization

```typescript
// app/layout.tsx
import { Inter, Roboto } from 'next/font/google';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',      // Prevent FOIT
  variable: '--font-inter'
});

const roboto = Roboto({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-roboto'
});

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${roboto.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

## Streaming & Suspense

```typescript
// app/page.tsx
import { Suspense } from 'react';
import { ProductSkeleton } from '@/components/skeletons';
import { ProductList } from '@/components/product-list';

export default function Page() {
  return (
    <div>
      <h1>Products</h1>
      
      {/* Show skeleton while loading */}
      <Suspense fallback={<ProductSkeleton />}>
        <ProductList /> {/* This streams in */}
      </Suspense>
    </div>
  );
}
```

## Error Handling

```typescript
// app/error.tsx
'use client';

export default function Error({
  error,
  reset
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="error-container">
      <h2>Something went wrong!</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

## Vercel Deployment Checklist

### Before Deploying

- [ ] Run `npm run build` locally
- [ ] Check for console errors
- [ ] Verify all environment variables are set
- [ ] Test on mobile devices
- [ ] Run Lighthouse audit

### Environment Variables

```bash
# Required for production
NEXT_PUBLIC_API_URL=https://api.example.com
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=your-secret
```

### Vercel Dashboard Configuration

1. **Build Settings**
   - Framework Preset: Next.js
   - Build Command: `next build`
   - Output Directory: `.next`

2. **Environment Variables**
   - Add all required env vars
   - Use different values for Production/Preview

3. **Analytics**
   - Enable Vercel Analytics
   - Enable Speed Insights

4. **Domains**
   - Configure custom domain
   - Set up SSL certificate

## Performance Targets

| Metric | Target | Vercel Grade |
|--------|--------|--------------|
| First Contentful Paint (FCP) | < 1.8s | Good |
| Largest Contentful Paint (LCP) | < 2.5s | Good |
| First Input Delay (FID) | < 100ms | Good |
| Cumulative Layout Shift (CLS) | < 0.1 | Good |
| Time to First Byte (TTFB) | < 600ms | Good |

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [React Server Components](https://react.dev/blog/2023/03/22/react-labs-what-we-have-been-working-on-march-2023#react-server-components)
- [Core Web Vitals](https://web.dev/vitals/)
