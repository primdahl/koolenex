# Missing Features — Koolenex vs ETS6 and the KNX Ecosystem

## What Koolenex Already Does Well

Koolenex covers a substantial portion of ETS6 functionality for project viewing, configuration, and bus interaction:

- .knxproj import (including password-protected), reimport
- Building structure, topology, device list, group addresses, com objects — all with search, filter, sort, column picker, CSV export
- Device parameter viewing and editing (full parameter page tree from dynamic XML)
- Device comparison (parameter diff side-by-side)
- Connection diagrams (device-GA relationships, animated with live telegrams)
- Bus Monitor with decoded DPT values, timeline, per-device and per-GA filtering
- Bus Scan (discover devices on a line)
- Device Info (read device properties over bus)
- Group read/write from bus monitor
- Individual address programming
- Application download (full, with known gaps)
- Floor plan with device placement
- KNXnet/IP tunnelling and USB connections
- Dark/light theme, internationalization, undo/redo, audit log
- Manufacturers view, global search

Among open-source tools, koolenex is unique: it's web-based with a full GUI. Calimero and knxd are libraries/daemons without UIs. Kaenx (C#/.NET) is the closest but is Windows-only and less complete on visualization.

## Missing Features — Grouped by Priority

### High Priority (Core Commissioning Gaps)

**Partial Download**
ETS tracks which parameters/GAs changed since the last full download and only sends the delta. Koolenex always does a full application download. This is slower and riskier for large devices. Requires mask tracking (which bytes were written) and loaded-image comparison.

**Download State Tracking**
ETS marks devices as needing re-download when parameters, GAs, or individual addresses change. The status should distinguish between "application needs download", "parameters changed", "GAs changed", "IA changed". Koolenex has a status badge but doesn't precisely track dirty state per download category.

**Device Unload / Factory Reset**
ETS can unload the application program or fully reset a device to factory state. Not implemented in koolenex. This is essential for commissioning — you often need to reset a device before reprogramming.

**Device Restart**
Sending a restart command to a device over the bus. Simple to implement but not currently exposed.

**Duplicate Individual Address Detection**
ETS warns when two devices share the same individual address. Koolenex doesn't check for conflicts.

### Medium Priority (Diagnostic and Operational Gaps)

**Online Installation Diagnostics**
ETS can check whether all project devices are reachable on the bus and compare bus state vs. project state (e.g., "device at 1.1.5 is not responding"). This is valuable during commissioning to find wiring issues or offline devices.

**Group Monitor (Dedicated)**
ETS has a separate Group Monitor that shows only group telegrams with decoded DPT values, filterable by address. Koolenex's bus monitor with per-GA filtering partially covers this, but a dedicated view optimized for group traffic would be useful.

**KNXnet/IP Routing**
Koolenex only supports tunnelling. Routing (multicast) is used in larger installations and allows multiple clients to share the bus simultaneously.

**Line Coupler / Filter Table Management**
ETS manages coupler filter tables that control which group addresses pass between lines/areas. Important for multi-line installations. Not implemented.

### Lower Priority (Nice-to-Have)

**Product Catalog**
ETS has a catalog of 8000+ certified KNX devices. Koolenex can only work with devices already in a .knxproj file. A catalog would allow adding new devices from manufacturer descriptions (.knxprod files). This is a large feature — the catalog format is complex.

**Project Export (.knxproj)**
Koolenex imports but does not export .knxproj files. This would enable round-tripping: edit in koolenex, export back to ETS. The .knxproj format is a ZIP of XML files with a defined schema, so this is feasible but substantial.

**Project Version Archive and Diff**
ETS6 stores multiple project versions and can compare them. Koolenex has reimport but no version history or project-to-project diff. Git-based tracking of the database or export snapshots could work.

**Print / Report Generation**
ETS generates printable installation reports (device lists, GA assignments, wiring diagrams). Useful for handover documentation. The CSV exports partially cover this.

**KNX Secure (IP Secure and Data Secure)**
Modern installations increasingly use KNX Secure for encrypted communication. This requires certificate management, secure tunnelling (KNXnet/IP Secure), and application-level encryption (KNX Data Secure). Significant implementation effort.

**ETS4/ETS5 Project Import**
Only ETS6 .knxproj is supported. Older ETS4/ETS5 formats use a different (but similar) XML structure.

**OPC Export**
Some building management systems import KNX project data via OPC. Niche but occasionally requested.

**KNX IoT / Semantic Export**
Covered separately in research/kim-semantic-export.md. JSON-LD and TTL export based on the KNX Information Model (KIM).

**Segment Coupler Support**
For TP/RF mixed installations with segment couplers.

**KNX RF Multi Support**
Radio-frequency KNX devices have additional configuration requirements.

## Open-Source Landscape

| Tool | Type | Language | What it offers beyond koolenex |
|------|------|----------|-------------------------------|
| Calimero | Library/toolkit | Java | FT1.2 and TP-UART support, KNX Secure, more complete management services |
| knxd | Daemon/router | C++ | Multi-interface bridging, acts as KNXnet/IP server/router |
| Kaenx | GUI tool | C#/.NET | Product database/catalog support (Windows-only) |
| OpenKNX | Firmware | C++ | Open-source KNX device firmware (not a commissioning tool) |

