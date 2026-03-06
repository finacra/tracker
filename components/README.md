# Components

This folder contains all React components organized by their purpose.

## Structure

### `/admin`
Admin-specific components for managing users, transactions, and administrative features.
- `AllUsersManagement.tsx` - Manage all users
- `TransactionHistory.tsx` - Transaction history display
- `UsersManagement.tsx` - User management interface

### `/features`
Feature-specific components that implement business logic and functionality.
- `Analytics.tsx` - Analytics component
- `AnalyticsWrapper.tsx` - Analytics wrapper
- `BulkTemplateUpload.tsx` - Bulk template upload functionality
- `CompanySelector.tsx` - Company selection component
- `CountrySelector.tsx` - Country selection component
- `EmbeddedPricing.tsx` - Embedded pricing display
- `ManualVerificationNotice.tsx` - Manual verification notice
- `PaymentButton.tsx` - Payment button component
- `PricingTiers.tsx` - Pricing tiers display

### `/layout`
Layout components for page structure and navigation.
- `Header.tsx` - Main application header
- `PublicHeader.tsx` - Public-facing header

### `/ui`
Reusable UI components and visual elements.
- `CircuitBackground.tsx` - Circuit pattern background
- `SubtleCircuitBackground.tsx` - Subtle circuit background variant
- `Toast.tsx` - Toast notification component

## Usage

Import components using their new paths:
```typescript
// UI components
import Toast from '@/components/ui/Toast'
import CircuitBackground from '@/components/ui/CircuitBackground'

// Layout components
import Header from '@/components/layout/Header'
import PublicHeader from '@/components/layout/PublicHeader'

// Feature components
import CompanySelector from '@/components/features/CompanySelector'
import PaymentButton from '@/components/features/PaymentButton'

// Admin components
import UsersManagement from '@/components/admin/UsersManagement'
```
