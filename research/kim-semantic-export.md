# KNX Information Model (KIM) — Semantic Export/Import Research

## What is KIM?

KIM is an OWL/RDF ontology (standardized as EN 50090-6-2) that describes KNX installations as a semantic graph. ETS6 can export projects as JSON-LD or Turtle (.ttl) files using this model. The ontology is MIT-licensed and available at:

- Turtle: https://update.knx.org/data/Semantics/ontology/v2/ontology.ttl
- JSON-LD: http://schema.knx.org/2020/ontology?destination_format=jsonld
- Source: https://gitlab.knx.org/public-projects/hbes-information-model
- Docs: https://buildwithknxiot.knx.org/public-projects/knx-iot-docs/kim/introduction/

## How KNX concepts map to KIM

| Koolenex (ETS) | KIM Class | Key Properties |
|---|---|---|
| Project | `core:Installation` | project metadata |
| Device | `core:Device` | `knx:individualAddress`, manufacturer, model |
| Group Address | `knx:FunctionPoint` | `knx:groupAddress` |
| Group Object | `core:Datapoint` / `core:Point` | `knx:datapointType`, semantic tags |
| DPT | `knx:DatapointType` | major/minor number, field structure |
| Building/Floor/Room | `loc:Building`/`loc:Floor`/`loc:Room` | spatial hierarchy |
| Application Function | `knx:lightingCtrl`, `knx:shadingCtrl`, etc. | what a group of points *does* |

The key addition KIM brings beyond what's in a `.knxproj` is semantic tagging — each point gets tags describing its *function* (e.g., lighting control), *phenomenon* (temperature, humidity), *interface type* (sensor vs actuator), and *operation kind* (status, command, setpoint).

## Key Namespaces

| Prefix | URI | Purpose |
|--------|-----|---------|
| `core:` | `http://schema.knx.org/2023/en50090-6-2/core#` | Core model classes |
| `knx:` | `http://schema.knx.org/2020/ontology/knx#` | KNX-specific entities |
| `loc:` | `http://schema.knx.org/2023/en50090-6-2/loc#` | Location model |
| `tag:` | `http://schema.knx.org/2023/en50090-6-2/tag#` | Tag/semantic model |
| `mac:` | `http://schema.knx.org/2020/ontology/mac#` | Monitoring and Control point definitions |

## Core OWL Classes

**Core model** (`core:` namespace):
- `core:Installation` — a KNX project
- `core:Device` — a physical device
- `core:Point` / `core:Datapoint` / `core:Actionpoint` / `core:Eventpoint` — I/O interfaces
- `core:ApplicationFunction` — groups sensor/actuator datapoints into a control function
- `core:FunctionalBlock` — standardized device functionality definition
- `core:Location`, `core:Equipment`, `core:Product`

**KNX model** (`knx:` namespace):
- `knx:FunctionPoint` — communication link between devices (= Group Object / Group Address)
- `knx:Channel` — manufacturer-specific point grouping
- `knx:DatapointType` — KNX DPT definition (e.g., DPT 1.001 Switch)
- Application function subclasses: `knx:lightingCtrl`, `knx:shadingCtrl`, `knx:airCtrl`, `knx:energyCtrl`, `knx:equipmentCtrl`, `knx:waterCtrl`, `knx:monitoring`, `knx:sceneCtrl`, etc.

**Location model** (`loc:` namespace):
- `loc:Site`, `loc:Building`, `loc:Floor`, `loc:Room`, `loc:Space`, `loc:Outside`

**Tag model** (`tag:` namespace):
- `tag:EquipmentType`, `tag:Locality`, `tag:PhenomenonType`, `tag:PointFunctionType`, `tag:PointInterface`, `tag:PointOperation`, `tag:QuantityKind`, `tag:StateType`, `tag:Trade`

**MaC model** (`mac:` namespace):
- Pre-built point templates for common scenarios: `mac:switchLight`, `mac:blinds`, `mac:roomTemperatureControl`, `mac:dimLight`, etc.

## Key Relationships

- `core:hasPoint` / `core:hasDatapoint` — Device has Points
- `core:supportsFunctionalBlock` — Device supports FunctionalBlock
- `knx:datapointType` — Point has a DatapointType
- `knx:hasFunctionPoint` — links to group addresses
- `knx:composesInput` / `knx:composesOutput` — ApplicationFunction composition
- `loc:hasBuilding` / `loc:hasFloor` / `loc:hasRoom` — spatial hierarchy
- `tag:hasTag` — attach semantic tags to entities

## ETS Semantic Export

ETS6 (v6.3.0+) supports semantic export via:
- Menu: Export -> "Turtle File Export (.ttl)" or "Json Linked Data (.jsonld)"
- SDK: `ExportSemanticDataAsync` method

The export contains the complete KIM ontology snapshot plus project instance data: devices, group addresses (as `knx:FunctionPoint`), locations, application functions, datapoint types, and semantic tags.

## Implications for Koolenex

### Import (reading JSON-LD / TTL)

- Would allow importing project data from semantic exports rather than only `.knxproj` files
- The richer semantic tags could be stored — e.g., knowing a group address is specifically a "room temperature setpoint" rather than just "DPT 9.001"
- Application functions (groups of related points like "room heating control") aren't in `.knxproj` but are in KIM exports

### Export (writing JSON-LD / TTL)

- Would let users export their koolenex project as a standards-based semantic graph
- Other tools, building management systems, or digital twin platforms could consume it
- Enables ISO 52120-1 energy efficiency classification through automated reasoning

### What koolenex already has that maps well

- Devices with individual addresses, manufacturers, models
- Group addresses with DPTs
- Com objects linking devices to GAs
- Building/floor/room spatial hierarchy (spaces table)

### What koolenex would need to add

- A way to store/display semantic tags (function type, phenomenon, point interface)
- Application function groupings (these go beyond simple GA-to-device links)
- An RDF serialization layer (a JS library like `jsonld` or `n3` for reading/writing)
- The KIM ontology itself as a reference

### Practical value

The main win is interoperability. Anyone doing building automation integration, digital twins, or energy management would benefit from being able to round-trip between koolenex and the semantic format. Import is probably higher value than export since ETS already exports KIM — koolenex could be an alternative viewer/editor for those exports.

## References

- KIM Introduction: https://buildwithknxiot.knx.org/public-projects/knx-iot-docs/kim/introduction/
- KNX IoT Semantics: https://support.knx.org/hc/en-us/articles/4402060368658-KNX-IoT-Semantics
- Semantic Export: https://support.knx.org/hc/en-us/articles/13991390217362-Semantic-export
- ETS6 SDK v6.3.0: https://support.knx.org/hc/en-us/articles/23198635755794-ETS6-SDK-v6-3-0
- HBES Information Model Repository: https://gitlab.knx.org/public-projects/hbes-information-model
- KNX Ontology TTL: https://update.knx.org/data/Semantics/ontology/v2/ontology.ttl
