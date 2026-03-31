# Device Label Printing

## The Problem

KNX installers need labels on devices showing the individual address and function. These go on the device front face, on DIN rail below devices, or on a legend sheet inside the distribution board door.

## What Goes on a Label

Ranked by importance:

1. **Individual address** (e.g., "1.1.5") — the primary identifier when troubleshooting
2. **Device name / function** (e.g., "Living Room Dimmer") — what the device does
3. **Location** (e.g., "Ground Floor / Living Room") — useful if not obvious from context
4. **QR code** — could encode the individual address or a URL to the device page in koolenex
5. **Manufacturer / model** — low priority since it's usually already printed on the device itself

Minimal label layout:
```
┌─────────────────────────────┐
│  1.1.5       ▄▄▄▄           │
│  Living Room Dimmer    █QR█ │
│  GF / Living Room      ▀▀▀▀ │
└─────────────────────────────┘
```

## Physical Constraints

- Standard DIN rail module: 17.5 mm wide per unit (1 TE)
- Typical KNX devices: 2-8 TE wide (35-140 mm)
- Available labeling area on front face: ~10-20 mm tall below manufacturer markings
- Sweet spot for device labels: **35-50 mm wide x 10-12 mm tall**

## Label Sheet Options

Avery sheets supported in koolenex, ordered by size:

| Avery # | Size (mm) | Labels/Sheet | Material | Use Case |
|---------|-----------|-------------|----------|----------|
| L4730 | 17.8 x 10 | 270 | White removable paper | Smallest printable label — address only |
| L4731 | 25.4 x 10 | 189 | White removable paper | Address + short name |
| L6008 | 25.4 x 10 | 189 | Silver polyester (permanent) | Same layout as L4731 but heavy-duty: water/oil/UV resistant, -40C to +150C. Ideal for permanent device labeling |
| L4732 | 35.6 x 16.9 | 80 | White removable paper | Address + name + location — most readable |

| L7651 | 38.1 x 21.2 | 65 | White paper | Small address labels |
| L7636 | 45.7 x 21.2 | 48 | White paper | General mini labels |
| L7656 | 46 x 11.1 | 84 | White paper | Narrow and long — good for DIN rail devices |

The L4730 (17.8 x 10mm) is the smallest printable Avery label. A device address like "1.1.5" fits comfortably in 5-6pt monospace. The L6008 is the best choice for permanent installation labeling due to its durable silver polyester material.

Also useful: a **full A4 legend sheet** — a table of all devices with addresses and functions, stuck to the inside of the distribution board door. This is also implemented.

## Implementation Approaches

### Approach 1: CSS @media print (Recommended First Step)

A "Print Labels" button opens a new window with print-optimized HTML. The user selects a label sheet format, picks which devices to include, and uses the browser's print dialog.

**How it works:**
- `@page { size: A4; margin: 0; }` to control page geometry
- CSS Grid matching the label sheet's rows and columns
- Dimensions in mm for precision
- `page-break-inside: avoid` on each label cell
- QR codes rendered as inline SVGs

**Pros:** Zero dependencies, works everywhere, cheap (just paper + label sheets), browser print preview lets the user check alignment.

**Cons:** Slight alignment variance between printers (need "test print on plain paper" step). Browser print margins can interfere.

### Approach 2: PDF Generation

Generate a PDF client-side using jsPDF or pdf-lib. Elements are positioned in exact mm coordinates matching the label sheet layout.

**Libraries:**
- **jsPDF** — most popular, ~280 KB, positions elements in mm, supports images
- **pdf-lib** — modern, actively maintained, good for precise positioning
- **pdfmake** — declarative approach, heavier

**Pros:** Pixel-perfect output regardless of browser. No CSS print quirks. User gets a reusable file.

**Cons:** Additional dependency. Font embedding can be tricky for non-Latin characters.

### Approach 3: Thermal Label Printers

DYMO LabelWriter exposes a local REST API via DYMO Connect software (`https://localhost:41951/`). Brother P-touch has a Windows-only COM SDK.

**Verdict:** Not worth targeting. Too many variables (driver installation, OS, model detection). Users with thermal printers can print from the generated PDF.

## QR Code Libraries

- **qrcode** (npm) — most popular, generates Canvas/SVG/data URL, ~33 KB
- **qrcode-generator** — lightweight ~10 KB, pure JS, Canvas/SVG output

SVG output is ideal for print — scales without pixelation at any resolution.

## Recommended Plan

### Phase 1: Print Labels View

1. Add a "Print Labels" button accessible from the Devices view and from individual device panels
2. New PrintLabelsView or modal:
   - Device selector (checkboxes, or "all devices", "all in this space", etc.)
   - Label sheet format picker (2-3 common Avery sizes + legend sheet)
   - Field selector (address, name, location, QR code)
   - Preview showing the label layout
   - "Print" button opens browser print dialog
3. Use `qrcode` package (or `qrcode-generator` for zero-dep) to render QR SVGs
4. CSS @media print stylesheet with mm-precise layout for each label sheet format

### Phase 2: PDF Download

5. Add jsPDF as an optional dependency
6. "Download PDF" button alongside the print button
7. Same label sheet definitions but rendered to PDF with exact mm coordinates
8. Eliminates browser print margin issues

### Legend Sheet (could be Phase 1 or 2)

A full-page table showing all devices in the project:
- Grouped by area/line or by location
- Columns: address, name, manufacturer, model, location
- Designed to print on plain A4 and be stuck inside the distribution board door
- This is simpler than label sheets (just a styled HTML table with print CSS)
