---
name: Crown Excel General
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
  on-surface-variant: '#434655'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#943700'
  on-tertiary: '#ffffff'
  tertiary-container: '#bc4800'
  on-tertiary-container: '#ffede6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb596'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#7d2d00'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
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
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

The design system is anchored in a philosophy of "Intentional Clarity." It is designed for professional environments where efficiency and precision are paramount. The brand personality is authoritative, reliable, and modern, avoiding unnecessary decoration in favor of high-utility layouts.

The visual style is a blend of **Modern Minimalism** and **High-Contrast Functionalism**. By maintaining a foundation of 70% white space, the UI breathes, reducing cognitive load for the user. Purposeful contrast is achieved through the surgical application of a singular accent color, ensuring that interactive pathways are unmistakable and the hierarchy remains rigid and logical.

## Colors

The palette is dominated by a clean, expansive white (#FFFFFF), which serves as the canvas for all interactions. This "70% White" rule ensures that the interface feels light and systematic. 

**Electric Blue (#2563eb)** is the sole driver of action. It is used exclusively for primary buttons, active states, and critical highlights. To provide depth without clutter, a Slate-inspired neutral scale is used for typography and borders, ranging from deep charcoal for headers to soft light-gray for subtle containment. Contrast is used as a tool for navigation: if it is Blue, it is interactive; if it is Dark Gray, it is information.

## Typography

The design system utilizes **Inter** as the primary typeface. It provides a systematic, neutral, and highly legible aesthetic that mirrors the functional nature of Helvetica while being optimized for digital screens.

Typography is treated with strict hierarchical rules. Headlines utilize a slightly tighter letter spacing and heavier weights to command attention against the white background. Body text is kept at a comfortable 16px base to ensure long-form readability. Labels and metadata utilize a medium-weight 14px size, often in uppercase, to create a clear distinction between data and instruction.

## Layout & Spacing

The layout is built on a **12-column fluid grid** for desktop and a **4-column grid** for mobile. A strict 4px baseline grid governs all vertical rhythm, ensuring every element is aligned to a consistent mathematical scale.

Generous margins (48px on desktop) reinforce the "70% white" aesthetic, pushing content toward the center to maintain focus. Components are separated by large gaps (typically 32px or 64px) to avoid visual noise. Padding within containers is standardized at 24px to ensure content never feels cramped against its borders.

## Elevation & Depth

This design system avoids heavy shadows and skeuomorphism in favor of **Tonal Layers** and **Low-Contrast Outlines**. Depth is communicated through subtle shifts in background color and razor-thin borders.

- **Level 0 (Base):** Pure white background.
- **Level 1 (Cards/Containers):** Defined by a 1px solid border in a light neutral gray (#E2E8F0). No shadow.
- **Level 2 (Hover/Active):** A very soft, diffused ambient shadow (0px 4px 12px rgba(0, 0, 0, 0.05)) is used only when an element is lifted by user interaction.
- **Overlays:** Modals and menus use a backdrop blur to maintain the glass-like transparency of the "70% white" philosophy while focusing the user on the task at hand.

## Shapes

The shape language is professional and "Soft." By using a **0.25rem (4px) base radius**, we move away from the harshness of sharp corners without losing the corporate structure. 

Buttons and input fields follow this 4px rule to maintain a sense of precision. Larger containers, such as dashboard cards, may use the `rounded-lg` (8px) token to feel more approachable. Circles are reserved strictly for user avatars and status indicators to ensure they stand out as distinct "human" or "state" elements within a predominantly rectangular system.

## Components

### Buttons
Primary buttons are solid **Electric Blue (#2563eb)** with white text. Secondary buttons use a light gray ghost style with blue text. Buttons have a fixed 4px border radius and use semi-bold typography.

### Input Fields
Inputs are defined by a 1px neutral border. Upon focus, the border transitions to Electric Blue with a subtle 2px glow. Placeholder text is kept light to maintain the minimalist aesthetic.

### Cards
Cards are the primary container for data. They feature a white background and a 1px neutral border. They should never have shadows in their default state, relying on the layout grid for separation.

### Chips & Badges
Used for status and tagging. They utilize low-saturation backgrounds (e.g., light blue or light gray) with high-saturation text to ensure they are readable without competing with primary action buttons.

### Lists & Data Tables
Tables should have minimal borders—typically only horizontal dividers. High whitespace within cells (16px padding) is required to ensure data density does not compromise the clean visual narrative of the system.