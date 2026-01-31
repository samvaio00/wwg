# B2B Wholesale Commerce Platform - Design System

## Overview

This document outlines the design system for the B2B Wholesale Commerce Platform, targeting retailers who purchase:
- Sunglasses
- Cellular accessories
- Caps / headwear
- Perfumes
- Novelty and impulse items for gas stations and convenience stores

## Design Philosophy

### Visual Direction
The UI must feel:
- **Professional and trustworthy** - Enterprise-grade appearance
- **Fast and efficient** - Optimized for repeat wholesale buyers
- **Practical and grid-based** - SKU-driven navigation
- **Clean and modern** - Commercial polish without being overly fashionable

### Design Inspirations
Drawing principles (not copying) from:
- **Amazon Business** - Efficiency and functionality
- **McMaster-Carr** - Dense but navigable product catalogs
- **Shopify Plus B2B** - Conversion clarity
- **Stripe** - Typography and hierarchy
- **Apple Business** - Restraint and focus

## Color Palette

### Light Mode

| Token | HSL Value | Usage |
|-------|-----------|-------|
| Background | 210 20% 98% | Page backgrounds |
| Foreground | 222 47% 11% | Primary text |
| Primary | 217 91% 50% | CTAs, links, focus states |
| Secondary | 214 20% 94% | Secondary buttons |
| Muted | 214 20% 96% | Subtle backgrounds |
| Accent | 214 95% 95% | Highlighted areas |
| Destructive | 0 72% 51% | Error states, delete actions |

### Dark Mode

| Token | HSL Value | Usage |
|-------|-----------|-------|
| Background | 222 47% 8% | Page backgrounds |
| Foreground | 210 20% 98% | Primary text |
| Primary | 217 91% 60% | CTAs, links, focus states |
| Secondary | 222 40% 18% | Secondary buttons |
| Muted | 222 40% 14% | Subtle backgrounds |
| Accent | 217 50% 20% | Highlighted areas |

### Sidebar (Dark Navigation)

The sidebar uses a dark navy theme for professional navigation:
- Background: 222 47% 11% (light mode) / 222 47% 6% (dark mode)
- Creates visual separation between navigation and content
- Reinforces enterprise-grade appearance

## Typography

### Font Stack
```css
--font-sans: 'Inter', 'Open Sans', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Hierarchy
- **H1**: 2.25rem (36px) - Page titles
- **H2**: 1.875rem (30px) - Section headers
- **H3**: 1.5rem (24px) - Card titles
- **H4**: 1.25rem (20px) - Subsections
- **Body**: 1rem (16px) - Standard text
- **Small**: 0.875rem (14px) - Labels, metadata
- **Caption**: 0.75rem (12px) - Fine print

### Letter Spacing
Default tracking: -0.011em (slightly tightened for modern feel)

## Spacing System

Using Tailwind's 4px base unit:
- **xs**: 4px (p-1)
- **sm**: 8px (p-2)
- **md**: 16px (p-4)
- **lg**: 24px (p-6)
- **xl**: 32px (p-8)
- **2xl**: 48px (p-12)

## Border Radius

Conservative, professional radii:
- **sm**: 3px - Small elements
- **md**: 6px - Buttons, inputs
- **lg**: 9px - Cards, modals

## Shadows

Clean, subtle depth:
- Cards use minimal shadow for subtle elevation
- Dropdowns/modals use medium shadow
- Focus states use ring (primary color)

## Component Patterns

### Buttons
- **Primary**: Blue background, white text - main CTAs
- **Secondary**: Gray background - secondary actions
- **Ghost**: Transparent - tertiary actions
- **Destructive**: Red - dangerous actions

### Cards
- White background (dark: navy)
- Subtle border
- Consistent padding (p-6)
- No nested cards

### Forms
- Clear labels above inputs
- Inline validation messages
- Consistent input heights
- Focus ring on interaction

### Navigation
- Dark sidebar for primary navigation
- Breadcrumbs for deep navigation
- Clear visual hierarchy

## Responsive Breakpoints

- **sm**: 640px
- **md**: 768px
- **lg**: 1024px
- **xl**: 1280px
- **2xl**: 1536px

## Accessibility

- WCAG 2.1 AA compliance target
- Minimum contrast ratio 4.5:1
- Keyboard navigable
- Screen reader friendly
- Focus visible states

## Product Grid

For product discovery:
- 3x5 grid (15 visible tiles) on desktop
- 2x grid on tablet
- 1x grid on mobile
- Consistent card heights
- Quick-add to cart actions

---

*Last updated: Phase 1 - Foundation*
