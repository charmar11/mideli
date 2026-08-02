---
name: Mideli
description: "Dark mode POS, warm surfaces, Mideli Rose actions, premium gold accents"
colors:
  canvas: "#111014"
  surface: "#211D24"
  raised: "#2A242E"
  ink: "#0D0B10"
  brand: "#F5145F"
  brand-hover: "#FF3B78"
  cream: "#FBF8E7"
  gold: "#F6DDA4"
  success: "#36C275"
  warning: "#F3A34D"
  danger: "#FF667A"
  border: "#3A323D"
  muted: "#B9AEB1"
typography:
  brand:
    fontFamily: "Pacifico, cursive"
    fontSize: "1.75rem"
    fontWeight: 400
  ui:
    fontFamily: "Sora, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
  body:
    fontFamily: "Karla, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 700
  micro:
    fontSize: "10px"
  caption:
    fontSize: "11px"
  meta:
    fontSize: "12px"
rounded:
  md: "8px"
  lg: "12px"
  xl: "16px"
  "2xl": "20px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "#FFFFFF"
    rounded: "{rounded.xl}"
    height: "48px"
  chip-active:
    backgroundColor: "{colors.brand}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.cream}"
    rounded: "{rounded.2xl}"
---

# Design System: Mideli

## Overview

**Creative North Star: "Mideli night service"**

El POS vive en un canvas carbón profundo (#111014), con superficies cálidas en capas, acentos Mideli Rose y detalles crema y dorados. La interfaz se siente como el turno nocturno del local: clara, rápida y con suficiente carácter para que el equipo la reconozca al instante.

Operación primero: mismos flujos, targets grandes, menos fricción. La personalidad aparece en el wordmark, los estados de servicio, el contraste y los detalles del carrito, sin distraer del pedido.

**Key Characteristics:**
- Dark charcoal canvas with warm raised panels
- Rose primary actions and active states
- Cream text with muted lavender secondary text
- Gold used for money, highlights and premium context
- KDS tickets with colored status headers
- Mobile bottom nav and desktop rail

## Colors

### Primary
- **Brand** #F5145F / hover #FF3B78, CTAs, precios, focus
- **Ink** #0D0B10, sidebar, cart footer, high-contrast controls

### Neutral
- **Canvas** #111014, app background
- **Surface** #211D24, cards and panels
- **Raised** #2A242E, chips, secondary controls and nested sections
- **Border** #3A323D, grouping and field boundaries
- **Muted** #B9AEB1, supporting labels and metadata
- **Cream** #FBF8E7, primary text and brand warmth

### Semantic
- Success #36C275
- Warning #F3A34D
- Danger #FF667A
- Gold #F6DDA4

### Named Rules
**The Night Service Rule.** The app canvas stays dark, but never flat. Use surface and raised layers to preserve hierarchy.
**The Rose Action Rule.** Rose is reserved for the next meaningful action, active navigation and money emphasis.
**The Gold Accent Rule.** Gold communicates value, not action. Use it for totals, premium cues and selected analytics series.
**The Contrast Rule.** Body copy stays on surface colors with readable cream or muted text. Do not use gray text that disappears into the canvas.
**The Operational Color Rule.** Green completes positive operations such as charge, send, deliver and save. Red confirms irreversible deletion or voiding. Orange marks pending, pausing, loss and attention. Neutral controls cancel, close, edit or inspect. Color always accompanies a specific label or icon.

## Typography

Pacifico is reserved for the wordmark. Sora bold is UI and headings. Karla is body copy. JetBrains Mono is used for prices, timers, order numbers and inventory counts.

## Layout

- Desktop: ink sidebar 76 to 224px plus dark main canvas
- Mobile: top bar plus bottom tab bar
- POS: catalog plus cart rail, with a rose action pill on mobile
- KDS: card grid with status-colored headers
- Admin: consistent dark surfaces with focused content widths

## Elevation and Depth

Use borders for grouping and soft black shadows for lift. Float shadow belongs to modals, drawers and the mobile cart action. Avoid neon glows and large decorative gradients.

## Shapes

Use rounded-2xl cards, rounded-full category chips and rounded-xl controls. Keep corners consistent so the interface feels intentional at speed.

## Components

Creation and navigation buttons are rose. Final operational actions use their semantic color and are at least 44px high on touch surfaces. Cart totals use an ink footer with a perforated ticket detail. Product tiles use surface cards with visible hover and focus states. KDS headers communicate status with color and text.

## Do's and Don'ts

### Do
- Keep the dark layered system across POS, KDS and admin
- Use large touch targets and clear disabled states
- Preserve the existing paths and workflows
- Keep empty states useful and action-oriented

### Don't
- Use pure black as the whole application canvas
- Use gold as the primary CTA
- Use Pacifico outside the Mideli wordmark
- Add decorative motion that slows down service work
