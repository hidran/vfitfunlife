# Deployment Checklist

## Table of Contents
- [Pre-deployment](#pre-deployment)
- [Initial Setup](#initial-setup)
- [Post-deployment](#post-deployment)
- [Production Readiness](#production-readiness)
- [Rollback Plan](#rollback-plan)
- [Monitoring Setup](#monitoring-setup)

---

## Pre-deployment

### Code Quality

- [ ] All unit tests passing
  ```bash
  npm test
  ```
- [ ] All integration tests passing
  ```bash
  npm run test:integration
  ```
- [ ] E2E tests passing
  ```bash
  npm run test:e2e
  ```
- [ ] Code coverage meets threshold (>80%)
  ```bash
  npm run test:coverage
  ```
- [ ] Linting passes
  ```bash
  npm run lint
  ```
- [ ] TypeScript compilation successful
  ```bash
  npm run type-check
  ```
- [ ] No console errors or warnings
- [ ] No security vulnerabilities
  ```bash
  npm audit
  ```

### Build Verification

- [ ] Build successful
  ```bash
  npm run build
  ```
- [ ] No build errors
- [ ] Assets optimized
- [ ] Bundle size acceptable
- [ ] Static export generated (if applicable)
  ```bash
  ls -la out/
  ```

### Environment Variables

- [ ] Environment variables set for target environment
  ```bash
  # Check .env.production or environment config
  cat .env.production
  ```
- [ ] Firebase configuration correct
  - [ ] API keys
  - [ ] Project ID
  - [ ] App ID
  - [ ] Measurement ID
- [ ] Stripe keys configured (live mode for production)
  - [ ] Publishable key
  - [ ] Secret key (in Functions config)
  - [ ] Webhook secret
- [ ] Google Maps API key configured
- [ ] SendGrid/API key for email configured
- [ ] App URLs configured correctly
  - [ ] NEXT_PUBLIC_APP_URL
  - [ ] Firebase hosting domain

### Firebase Setup

- [ ] Firestore rules deployed
  ```bash
  firebase deploy --only firestore:rules
  ```
- [ ] Firestore indexes deployed
  ```bash
  firebase deploy --only firestore:indexes
  ```
- [ ] Storage rules deployed
  ```bash
  firebase deploy --only storage
  ```
- [ ] Cloud Functions deployed
  ```bash
  firebase deploy --only functions
  ```
- [ ] Firebase Hosting configured
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active

### Security

- [ ] Firestore rules reviewed and tested
- [ ] Storage rules reviewed
- [ ] Cloud Functions have proper auth checks
- [ ] API keys are restricted
- [ ] Stripe webhooks secured
- [ ] No sensitive data in client-side code
- [ ] CORS configured correctly

---

## Initial Setup

### Database Seeding

- [ ] Seed user types (provider categories)
  ```bash
  node scripts/seed-user-types.js --env=production
  ```
  - [ ] Fitness categories
  - [ ] Wellness categories
  - [ ] Beauty categories
  - [ ] Mental health categories
  - [ ] Education categories
- [ ] Verify user types in Firestore console

- [ ] Seed sample users (optional, for testing)
  ```bash
  node scripts/seed-sample-users.js --env=production --count=5
  ```
- [ ] Seed venues (if applicable)
  ```bash
  node scripts/seed-venues.js --env=production
  ```

### OAuth Configuration

- [ ] Google OAuth configured
  - [ ] Authorized domains added in Google Cloud Console
    - [ ] Production domain
    - [ ] Firebase hosting domain
  - [ ] OAuth consent screen configured
  - [ ] Redirect URIs configured
    - [ ] https://your-app.firebaseapp.com/__/auth/handler
    - [ ] https://your-custom-domain.com
- [ ] Apple Sign-In configured (if applicable)
  - [ ] Service ID created
  - [ ] Domains registered with Apple
  - [ ] Private key uploaded to Firebase
- [ ] Phone Auth configured
  - [ ] reCAPTCHA configured
  - [ ] SMS quota checked

### Payment Setup

- [ ] Stripe account in live mode
- [ ] Stripe webhook endpoints configured
  - [ ] Endpoint URL: `https://your-region-your-project.cloudfunctions.net/stripeWebhook`
  - [ ] Events selected:
    - [ ] payment_intent.succeeded
    - [ ] payment_intent.payment_failed
    - [ ] customer.subscription.created
    - [ ] customer.subscription.deleted
    - [ ] invoice.payment_succeeded
    - [ ] charge.refunded
- [ ] Stripe webhook secret stored in Functions config
  ```bash
  firebase functions:config:set stripe.webhook_secret="whsec_xxx" --project production
  ```
- [ ] Test payment flow in production
- [ ] Configure payout schedule for providers

### Email Configuration

- [ ] SendGrid/API configured
  - [ ] API key stored in Functions config
    ```bash
    firebase functions:config:set sendgrid.api_key="SG.xxx" --project production
    ```
- [ ] Email templates uploaded
  - [ ] Welcome email
  - [ ] Booking confirmation
  - [ ] Booking reminder
  - [ ] Password reset
  - [ ] Provider verification
- [ ] Sender domain authenticated
- [ ] SPF and DKIM records configured

### Admin Setup

- [ ] Create superadmin account
  ```bash
  node scripts/create-admin.js --email=admin@example.com --role=superadmin
  ```
- [ ] Create initial admin accounts (if needed)
- [ ] Verify admin access to dashboard
- [ ] Test admin functions:
  - [ ] User management
  - [ ] Provider verification
  - [ ] Booking management
  - [ ] Content management

### Platform Settings

- [ ] Configure platform settings
  - [ ] Platform name and branding
  - [ ] Support contact information
  - [ ] Commission rates
  - [ ] Cancellation policy
  - [ ] Booking lead times
  - [ ] Deposit percentages
- [ ] Upload platform assets
  - [ ] Logo
  - [ ] Favicon
  - [ ] App icons

---

## Post-deployment

### Smoke Testing

- [ ] Test user registration
  - [ ] Email registration
  - [ ] Google OAuth
  - [ ] Phone OTP
- [ ] Test login/logout
- [ ] Test password reset
- [ ] Test profile creation
- [ ] Test profile updates
- [ ] Test avatar upload

### Booking Flow Testing

- [ ] Test provider search
- [ ] Test provider profile viewing
- [ ] Test booking creation
  - [ ] In-venue booking
  - [ ] Home service booking
  - [ ] Virtual booking
- [ ] Test payment processing
  - [ ] Card payment
  - [ ] Deposit payment
  - [ ] Points redemption
- [ ] Test booking confirmation
- [ ] Test booking cancellation
- [ ] Test reschedule

### Provider Flow Testing

- [ ] Test provider registration
- [ ] Test profile completion
- [ ] Test certification upload
- [ ] Test availability setting
- [ ] Test service creation
- [ ] Test booking confirmation
- [ ] Test booking completion
- [ ] Test earnings view

### Admin Testing

- [ ] Test admin login
- [ ] Test dashboard access
- [ ] Test user management
- [ ] Test provider verification
- [ ] Test booking management
- [ ] Test refund processing
- [ ] Test content management

### Integration Testing

- [ ] Test push notifications
- [ ] Test email delivery
- [ ] Test SMS delivery (if enabled)
- [ ] Test calendar sync
- [ ] Test map integration
- [ ] Test file uploads

### Mobile Testing (if applicable)

- [ ] Test iOS app
  - [ ] App Store build
  - [ ] Authentication
  - [ ] Core features
- [ ] Test Android app
  - [ ] Play Store build
  - [ ] Authentication
  - [ ] Core features

---

## Production Readiness

### Performance

- [ ] Lighthouse score > 90
  ```bash
  npm run lighthouse
  ```
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3.5s
- [ ] No layout shifts (CLS < 0.1)
- [ ] Images optimized
- [ ] Code split and lazy loaded

### SEO

- [ ] Meta tags configured
- [ ] Sitemap generated
- [ ] robots.txt configured
- [ ] Canonical URLs set
- [ ] Open Graph tags
- [ ] Structured data (JSON-LD)

### Analytics

- [ ] Firebase Analytics enabled
- [ ] Google Analytics 4 configured
- [ ] Custom events defined
- [ ] Conversion tracking set up
- [ ] Funnel analysis configured

### Legal/Compliance

- [ ] Terms of Service page
- [ ] Privacy Policy page
- [ ] Cookie consent banner
- [ ] GDPR compliance checklist
- [ ] Age verification (if required)
- [ ] Accessibility compliance (WCAG 2.1)

---

## Rollback Plan

### Preparation

- [ ] Previous version tagged in git
  ```bash
  git tag -a v1.0.0 -m "Version 1.0.0"
  ```
- [ ] Database backup created
  ```bash
  node scripts/backup-firestore.js --env=production
  ```
- [ ] Rollback procedure documented
- [ ] Rollback team identified

### Rollback Triggers

- [ ] Error rate > 5%
- [ ] Critical feature broken
- [ ] Payment processing failure
- [ ] Security incident
- [ ] Data corruption

### Rollback Steps

1. **Stop Deployment**
   ```bash
   firebase hosting:disable --project production
   ```

2. **Revert Code**
   ```bash
   git checkout v1.0.0
   ```

3. **Redeploy Previous Version**
   ```bash
   npm run build
   firebase deploy --project production
   ```

4. **Restore Database (if needed)**
   ```bash
   node scripts/restore-firestore.js --backup=backup-file.json
   ```

5. **Verify Rollback**
   - [ ] Site functional
   - [ ] No errors in logs
   - [ ] Critical features working

6. **Communicate**
   - [ ] Notify team
   - [ ] Update status page
   - [ ] Customer communication (if needed)

---

## Monitoring Setup

### Firebase Monitoring

- [ ] Firebase Performance Monitoring enabled
- [ ] Crashlytics configured
- [ ] Cloud Functions monitoring
  - [ ] Error alerting
  - [ ] Performance alerting
  - [ ] Memory usage alerts
- [ ] Firestore monitoring
  - [ ] Read/write quotas
  - [ ] Performance metrics

### External Monitoring

- [ ] Uptime monitoring (e.g., UptimeRobot)
- [ ] Error tracking (e.g., Sentry)
  ```bash
  npm install @sentry/nextjs
  ```
- [ ] Performance monitoring
- [ ] Real User Monitoring (RUM)

### Alerts

- [ ] Configure alert channels
  - [ ] Email
  - [ ] Slack
  - [ ] PagerDuty (if applicable)
- [ ] Define alert thresholds
  - [ ] Error rate > 1%
  - [ ] Response time > 2s
  - [ ] Function failures
  - [ ] Database errors

### Log Aggregation

- [ ] Cloud Functions logs configured
- [ ] Client-side error logging
- [ ] Audit log retention policy
- [ ] Log analysis dashboard

---

## Final Verification

- [ ] All smoke tests passed
- [ ] All integrations working
- [ ] Monitoring active
- [ ] Alerts configured
- [ ] Team notified
- [ ] Documentation updated
- [ ] On-call schedule active

**DEPLOYMENT APPROVED** ☐

**DEPLOYED BY**: _________________

**DATE**: _________________

**VERSION**: _________________
