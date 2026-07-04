---
name: Crown Excel Electronics
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#45464d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0058be'
  on-secondary: '#ffffff'
  secondary-container: '#2170e4'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#0b1c30'
  on-tertiary-container: '#75859d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
  unit-xs: 4px
  unit-sm: 8px
  unit-md: 16px
  unit-lg: 32px
  unit-xl: 64px
---

## Brand & Style

This design system transitions from a dark technical aesthetic to an **Elegant Minimalist** philosophy. It prioritizes clarity, breathability, and high-end precision. The visual narrative is built on a "70% White" rule—ensuring that the vast majority of the interface feels airy and illuminated, while maintaining authority through bold, high-contrast accents.

The target audience consists of discerning professionals and tech enthusiasts who value efficiency and understated luxury. The UI should evoke a sense of **quiet confidence, technical mastery, and timelessness**. We leverage soft glassmorphism and surgical precision in layout to ensure the brand feels premium and evolved.

## Colors

The palette is anchored by a dominant **70% Pure White (#FFFFFF)** background to establish a clean, editorial feel. 

*   **Primary:** A deep Slate Black (#0F172A) used for critical typography and primary call-to-action elements, providing a grounded, bold contrast.
*   **Secondary:** A Refined Blue (#3B82F6) reserved for interactive states, progress indicators, and subtle brand highlights.
*   **Neutral/Surface:** Soft greys (#F1F5F9, #F8FAFC) are used for container backgrounds and section dividers to prevent visual fatigue.
*   **Glassmorphism:** For overlays and floating headers, use a white tint with 70% opacity and a 20px backdrop blur to maintain the "illuminated" theme while adding depth.

## Typography

The system utilizes **Inter** (as the closest modern, high-end equivalent to Helvetica) to achieve a timeless, neutral, and highly legible typographic hierarchy. 

Headings should be set with tight letter-spacing (-0.01em to -0.02em) to appear "locked" and architectural. Body text requires generous line-height to maintain the airy feeling of the brand. Use weight strategically: Heavy weights (600+) for primary data points and headers, and Regular (400) for all descriptive content. All labels should be uppercase with slight tracking to denote technical precision.

## Layout & Spacing

The layout follows a **Fixed-Fluid Hybrid** model. Content is contained within a 1280px max-width grid on desktop, centered with expansive outer margins to emphasize the 70% white aesthetic.

A strict **8px baseline grid** governs all vertical rhythm. Use wide gutters (24px+) to ensure components never feel cramped. On mobile, margins reduce to 20px, and vertical stacking is preferred over horizontal scrolling to maintain the "premium app" feel. Negative space is treated as a first-class design element—when in doubt, increase the `unit-lg` or `unit-xl` padding between major sections.

## Elevation & Depth

To maintain the elegant white theme, avoid heavy, muddy shadows. Depth is achieved through two primary methods:

1.  **Tonal Layering:** Using the neutral palette (#F8FAFC) to lift containers off the pure white background. This creates a "staircase" effect of information hierarchy without needing borders.
2.  **Soft Ambient Shadows:** Use ultra-diffused shadows for floating elements like cards or modals. The shadow should be large (30px-40px blur) but very low opacity (3-5%), tinted with the primary slate color rather than pure black.
3.  **Glassmorphic Overlays:** For navigation bars and sidebars, use background blurs to provide a sense of place and transparency, reinforcing the "illuminated" brand character.

## Shapes

The shape language is **Professional and Controlled**. A medium roundedness (8px for standard components) provides a sophisticated balance between the aggression of sharp corners and the playfulness of fully rounded pills.

*   **Standard Components:** 8px (Buttons, Input Fields, Small Cards).
*   **Large Containers:** 16px (Main content sections, Modals).
*   **Inner Elements:** 4px (Chips, Tags, internal nested items) to maintain visual nesting logic.

## Components

### Buttons
Primary buttons use the Slate Black (#0F172A) background with white text for maximum impact. Secondary buttons should use a 1px Slate border or a soft grey ghost style. The hover state for primary buttons should be a subtle shift to the Secondary Blue.

### Input Fields
Inputs are defined by a light grey background (#F1F5F9) and a 1px border that only becomes visible (and turns Blue) on focus. Labels sit strictly above the field in uppercase `label-md` typography.

### Cards
Cards should be "Ghost Cards"—using either a very thin 1px border in a light neutral tone or a subtle tonal shift from the background. Avoid heavy shadows; let the typography and spacing define the boundaries.

### Navigation
The main navigation should be a persistent glassmorphic bar at the top of the viewport. Use high-contrast Slate for active links and a 70% opacity version of Slate for inactive links to maintain a clear visual hierarchy.

### Chips & Badges
Use for status and categorization. These should have 4px corners and use low-saturation versions of the primary/secondary colors to remain informative without being distracting.