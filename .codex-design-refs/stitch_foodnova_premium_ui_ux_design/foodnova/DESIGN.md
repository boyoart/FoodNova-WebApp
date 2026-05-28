---
name: FoodNova
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daef'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edff'
  surface-container-high: '#e1e8fd'
  surface-container-highest: '#dce2f7'
  on-surface: '#141b2b'
  on-surface-variant: '#404941'
  inverse-surface: '#293040'
  inverse-on-surface: '#edf0ff'
  outline: '#717970'
  outline-variant: '#c0c9be'
  surface-tint: '#2e6a41'
  primary: '#003b1b'
  on-primary: '#ffffff'
  primary-container: '#14532d'
  on-primary-container: '#87c695'
  inverse-primary: '#96d5a3'
  secondary: '#735c00'
  on-secondary: '#ffffff'
  secondary-container: '#fed01b'
  on-secondary-container: '#6f5900'
  tertiary: '#31332b'
  on-tertiary: '#ffffff'
  tertiary-container: '#484941'
  on-tertiary-container: '#b8b8ad'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b1f2be'
  primary-fixed-dim: '#96d5a3'
  on-primary-fixed: '#00210d'
  on-primary-fixed-variant: '#12512c'
  secondary-fixed: '#ffe083'
  secondary-fixed-dim: '#eec200'
  on-secondary-fixed: '#231b00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#e4e3d7'
  tertiary-fixed-dim: '#c7c7bc'
  on-tertiary-fixed: '#1b1c15'
  on-tertiary-fixed-variant: '#46473f'
  background: '#f9f9ff'
  on-background: '#141b2b'
  surface-variant: '#dce2f7'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Manrope
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-margin-mobile: 20px
  container-margin-desktop: 64px
  gutter: 24px
  section-gap: 48px
---

## Brand & Style
The design system is anchored in **Premium Minimalism** with a cinematic, editorial flair. It is designed to evoke a sense of high-trust and effortless luxury, treating grocery items as curated objects rather than commodities. 

The aesthetic identity is defined by "The Gallery Look": expansive white space, hyper-refined typography, and glassmorphic layers that create a sense of physical depth. It blends the architectural precision of high-end automotive interfaces with the warmth and approachability of a luxury lifestyle brand. The emotional response should be one of calm, confidence, and freshness.

## Colors
The palette is centered on "Forest & Gold." The **Primary Deep Green (#14532D)** represents freshness and heritage, used for key actions and brand moments. The **Warm Gold (#FACC15)** is used sparingly as a "prestige accent" for loyalty status, premium selections, or interactive highlights.

**Surface Strategy:**
- **Primary Surface:** Crisp White (#FFFFFF) for maximum clarity.
- **Secondary Surface:** Soft Cream (#FDFCF0) to soften the interface and add a gourmet feel.
- **Tertiary Surface:** Light Gray (#F3F4F6) for subtle grouping.
- **Dark Mode:** Utilizes a rich Charcoal Black (#0B0F0B) base with high-contrast Deep Green accents to maintain legibility and a premium evening aesthetic.

## Typography
The typography system uses **Manrope** for headlines and body text to achieve a modern, balanced, and trustworthy feel. **Hanken Grotesk** is introduced for labels and utility text to provide a sharp, technical contrast that aids navigation.

Hierarchy is established through significant scale shifts and generous line heights. High-contrast pairings—such as a `display-lg` headline followed by a light `body-lg` description—are encouraged to create an editorial, magazine-like flow.

## Layout & Spacing
The system utilizes a **12-column fixed grid** for desktop and a **4-column fluid grid** for mobile. The layout philosophy is "Spacious Luxury," favoring large margins and substantial vertical breathing room between sections.

Spacing follows an 8px base unit. To maintain the premium feel, avoid packing elements tightly; instead, use the `section-gap` to clearly demarcate different categories of food or service offerings. Elements should often be centered or offset to create a dynamic, non-repetitive rhythm.

## Elevation & Depth
Depth is communicated through **Ambient Shadows** and **Glassmorphism**.
- **Base Level:** Flat surface (White or Cream).
- **Interactive Cards:** Deep, multi-layered shadows (0px 20px 40px rgba(0,0,0,0.04)) create a soft lift.
- **Overlays/Navigation:** Glassmorphic containers with a `backdrop-filter: blur(20px)` and a thin 1px semi-transparent border (#FFFFFF33).
- **Floating Actions:** Elevated buttons use a tighter, more saturated shadow to indicate "pressability."

## Shapes
The shape language is characterized by **oversized, smooth radii**. 
- **Small Components (Buttons, Inputs):** Use `rounded-lg` (1rem/16px).
- **Featured Cards & Containers:** Use `rounded-xl` (1.5rem/24px) or even `2xl` for a "soft-tech" feel.
- **Image Containers:** Must always match the parent card radius to maintain a consistent silhouette.

## Components
- **Buttons:** Primary buttons are large (min-height 56px), utilizing the Deep Green with white text. Hover states should include a subtle scale-up (1.02x) rather than a simple color shift.
- **Cards:** Product cards feature edge-to-edge photography with the product title and price nested in a Glassmorphic footer area or on a clean white space below. Borders should be minimal or non-existent, relying on shadows for definition.
- **Input Fields:** Minimalist design with a 1px soft gray border that transitions to Deep Green on focus. Use Hanken Grotesk for placeholder text.
- **Glass Navigation:** The bottom navigation (mobile) and top header (desktop) are frosted glass layers, allowing content to scroll beautifully beneath them.
- **Chips/Status:** Rounded pill shapes using low-opacity versions of the Primary or Accent colors (e.g., a 10% Gold background for "Premium" status).
- **Iconography:** Thin-weight (2pt) stroke icons with rounded terminals to match the font geometry.