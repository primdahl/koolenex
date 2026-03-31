# Product Catalog Implementation Research

## Background

ETS has a product catalog of 8000+ certified KNX devices from 500+ manufacturers. Users browse the catalog to add devices to projects. Koolenex currently only works with devices already in a .knxproj file. This document explores what it would take to add catalog support.

## How KNX Product Data Is Stored

Both .knxproj and .knxprod files are ZIP archives with identical internal structure for product data. A .knxproj embeds copies of the product data for devices in the project. A .knxprod is a standalone product database entry from a single manufacturer.

### ZIP Structure

```
knx_master.xml                              # KNX master data (manufacturer IDs, DPTs, mask versions)
M-XXXX.signature                            # Cryptographic signature
M-XXXX/
  Catalog.xml                               # Product catalog tree (sections + items)
  Hardware.xml                              # Hardware definitions (physical specs, order numbers)
  M-XXXX_A-YYYY-ZZ-HHHH.xml                # One file per ApplicationProgram
  Baggages.xml                              # Optional: references to embedded files (plugins, images)
  Baggages/                                 # Optional: the embedded files themselves
```

### Catalog.xml

Hierarchical product organization by `CatalogSection` elements (e.g., "1.3 Interfaces/Gateways" > "1.3.14 IP devices"). Each leaf is a `CatalogItem` with:
- Name, Number, VisibleDescription (often the order number)
- `ProductRefId` linking to Hardware.xml
- `Hardware2ProgramRefId` linking hardware to its application program
- Multi-language translations

### Hardware.xml

Physical product definitions:
- `Hardware`: Id, Name, SerialNumber, VersionNumber, BusCurrent, HasIndividualAddress, IsIPEnabled
- `Product` (child): Id, Text, OrderNumber, IsRailMounted, WidthInMillimeter
- `Hardware2Program`: links hardware to application program, specifies MediumTypes (TP, IP, RF)

### ApplicationProgram XML

Full device configuration (already parsed by koolenex):
- Parameter types, parameters with memory offsets
- Communication objects with DPT, size, flags
- Dynamic UI tree (channels, blocks, choose/when conditions)
- Code segments with base64-encoded default memory images
- Load procedures

## What Koolenex Already Has

The ETS parser already extracts from .knxproj files:
- **knx_master.xml**: 781 manufacturer ID-to-name mappings
- **Hardware.xml**: manufacturer, model, orderNumber, busCurrent, widthMm, isPowerSupply, isCoupler, isRailMounted, model translations
- **ApplicationProgram XML**: Full app data cached as JSON in `data/apps/` (99 files in test project)
- **NOT parsed**: Catalog.xml is completely ignored. The catalog section hierarchy (product categories) is not extracted.

## How ETS Manages Its Catalog

- Stored at `%ProgramData%\KNX\ETS6\` with Online Catalog cache at `%ProgramData%\KNX\ETS6\OC\`
- **Online Catalog**: built into ETS since v5.6.5, checks for manufacturer updates periodically
- **Manual import**: users can import .knxprod files from manufacturer websites
- **Signatures**: every M-XXXX folder has a cryptographic signature. ETS refuses to import unsigned product data. Signatures are issued by the KNX Association.
- **No public API**: the Online Catalog is a proprietary ETS-internal service with no public access

## Two Levels of Catalog Support

### Level 1: Browse Products in Loaded Projects (Low Effort)

Parse the Catalog.xml files that are already embedded in every .knxproj:
- Extract the category tree (CatalogSection hierarchy)
- Link CatalogItems to the Hardware.xml products and ApplicationPrograms already parsed
- Build a browsable/searchable product tree in the UI
- Show which products are used in the project and which are available but unused

This requires no additional data sources -- the data is already in the ZIP.

**Work required:**
- Add Catalog.xml parsing to `ets-parser.js`
- Store catalog sections and items in the database
- Add a Catalog view UI component with tree navigation, search, and product detail

### Level 2: Standalone .knxprod Import (Medium Effort)

Allow users to upload .knxprod files to add new device types to koolenex:
- The .knxprod format is identical to the manufacturer portion of a .knxproj
- The existing parser can be extended to handle standalone .knxprod files
- New devices from the .knxprod could be added to any project

**Work required:**
- Add a .knxprod upload endpoint (similar to .knxproj import but manufacturer-data only)
- Store imported product data separately from project data
- UI for browsing imported products and adding them to projects
- Handle the signature issue: koolenex could choose to ignore signatures (ETS requires them, we don't have to)

### Level 3: Full Catalog (High Effort, No Clear Path)

A searchable catalog of all KNX products would require collecting .knxprod files:
- **No public catalog API or bulk download exists**
- Individual manufacturers host their own downloads: ABB, MDT, Gira, Schneider, Theben, etc.
- Each manufacturer's download page has different structure and naming conventions
- Keeping the catalog up-to-date would require periodic re-downloading

This is impractical as an automated feature but could work as a manual "import your manufacturer's .knxprod" workflow.

## Practical Implementation Plan

### Phase 1: Parse and Display Catalog from .knxproj

1. Add Catalog.xml parsing to `ets-parser.js`:
   - Extract `CatalogSection` hierarchy (id, name, number, parent)
   - Extract `CatalogItem` entries (id, name, productRefId, hardware2ProgramRefId)
   - Return alongside existing parsed data

2. Store in database:
   - New `catalog_sections` table (id, project_id, name, number, parent_id)
   - New `catalog_items` table (id, project_id, section_id, name, order_number, product_ref, app_ref)

3. Add a Catalog view:
   - Tree navigation by manufacturer and category
   - Search by name, order number, manufacturer
   - Product detail showing specs, parameters, com objects
   - "Add to project" button

### Phase 2: .knxprod Import

1. New upload endpoint: `POST /catalog/import` accepting .knxprod files
2. Parse using the same pipeline as .knxproj but extract only manufacturer/product data
3. Store in a separate `catalog_products` table (not project-specific)
4. Allow adding devices from imported catalog to any project

## Open-Source Tools for Reference

| Tool | Language | Purpose |
|------|----------|---------|
| [xknxproject](https://github.com/XKNX/xknxproject) | Python | ETS project parser |
| [OpenKNXproducer](https://github.com/OpenKNX/OpenKNXproducer) | C# | CLI to create .knxprod files |
| [Kaenx-Creator](https://github.com/OpenKNX/Kaenx-Creator) | C# | GUI to create/edit .knxprod files |

## Key Constraints

- **No public catalog API**: the KNX Online Catalog is ETS-proprietary
- **Signatures**: .knxprod files are cryptographically signed, but koolenex can choose to ignore this since we're not ETS
- **Size**: a full catalog would be very large (thousands of application programs). Practical to support on-demand import rather than pre-bundling
- **Licensing**: the XSD schemas require KNX member login to access officially, though the format is well-understood from actual .knxproj files
