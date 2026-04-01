# Test Plan

## Test Fixture

A dedicated ETS6 project built with the ABB KNX Starter Kit (Bemco):

| Device | Model | Type | Parameter Complexity |
|---|---|---|---|
| SV/S30.160.1.1 | Power supply 160mA | Power supply | Minimal (no app program) |
| USB/S1.1 | USB interface | Interface | Low |
| SAH/S8.6.7.1 | 8ch switch/blind actuator | Actuator | High — 8 channels configurable as switch or blind, staircase timers, scenes, logic, status feedback |
| UD/S4.210.2.1 | 4x210W LED dimmer | Actuator | High — 4 channels, dimming curves, min/max levels, switch-on behavior, soft start/stop, timing |
| US/U2.2 | Universal interface 2-fold | Sensor interface | Medium — 2 binary inputs, configurable function per input |
| 6108/07-500 | Push-button coupler 4-gang | Sensor coupler | Medium — 4 button channels, short/long press, LED feedback |

### What to configure in the ETS6 project

To exercise the parser and parameter memory assembly, the project should include:

**Topology:**
- At least 2 areas with at least 2 lines
- Devices spread across lines

**Building structure:**
- A building with at least 2 floors
- Rooms on each floor
- Devices assigned to rooms

**Group addresses:**
- At least 3 main groups with middle groups and sub addresses
- Mix of DPT types (1.001 Switch, 5.001 Percentage, 9.001 Temperature, etc.)
- Some GAs linked to multiple devices (fan-out)

**Parameters (non-default values):**
- SAH/S8.6.7.1: configure some channels as switch, others as blind; set non-default staircase timers, enable scene control on at least one channel
- UD/S4.210.2.1: set non-default dimming curves, min/max levels, switch-on values, soft start/stop times
- US/U2.2: configure one input as switch sensor, another as a different function (e.g., dimming sensor or scene control)
- 6108/07-500: configure short press and long press functions, enable LED feedback

**Communication objects:**
- Wire up GAs to com objects — at least some objects with multiple GAs (send + listen)
- At least one GA with devices on both sides (actuator + sensor)

### What to export/capture from ETS6

1. The `.knxproj` file — becomes `tests/fixtures/test-project.knxproj`
2. A reference spreadsheet or document listing:
   - Every device: address, name, manufacturer, model, order number, location
   - Every GA: address, name, DPT, linked devices
   - Every non-default parameter value per device (section, name, value)
3. Loaded images / memory dumps for each device (if possible — from ETS6 after full download)

## Test Structure

```
tests/
  fixtures/
    test-project.knxproj         — the ETS6 project
    expected/
      devices.json               — expected device list after import
      gas.json                   — expected GA list after import
      comobjects.json            — expected com object list after import
      spaces.json                — expected space tree after import
      catalog.json               — expected catalog sections and items
      param-memory/
        1.1.1.hex                — expected parameter memory per device
        1.1.2.hex
        ...
  parser.test.js                 — .knxproj parser tests
  param-memory.test.js           — parameter memory assembly tests
  api.test.js                    — REST API endpoint tests
  state.test.js                  — client state reducer tests
```

## Test Categories

### 1. Parser Accuracy (Highest Priority)

Verify that importing the test .knxproj produces the correct data.

**Device tests:**
- Correct number of devices extracted
- Each device has correct: individual_address, name, manufacturer, model, order_number, area, line, medium, device_type, space assignment
- Parameters array is populated and contains expected sections/names/values
- param_values object contains expected refId → value mappings
- app_ref points to a valid application program

**Group address tests:**
- Correct number of GAs extracted
- Each GA has correct: address, name, DPT, main_g, middle_g, sub_g
- Group names (main_group_name, middle_group_name) are correct

**Communication object tests:**
- Correct number of com objects per device
- Each has correct: object_number, name, function_text, DPT, flags, direction
- GA linkage (ga_address, ga_send, ga_receive) matches ETS6

**Space tests:**
- Correct building/floor/room hierarchy
- Space types and names match
- Device-to-space assignments are correct

**Catalog tests:**
- Catalog sections form correct hierarchy
- Catalog items link to correct products
- in_use flag correctly identifies products with devices in the project

### 2. Parameter Memory Assembly (High Priority)

For each device with an application program:
- Build the parameter memory image using `buildParamMem()`
- Compare byte-for-byte against the ETS6 reference dump
- Report any differing bytes with their offset, expected value, and actual value

Key things that exercise the assembly pipeline:
- Conditional parameters (choose/when based on channel mode)
- Parameters in different memory segments
- Bit-packed values (sub-byte parameters sharing a byte)
- Multi-byte values (16-bit, 32-bit)
- KNX float16 values (DPT 9.x)
- Inactive parameters (should NOT be written — base image value preserved)

The SAH/S8.6.7.1 and UD/S4.210.2.1 are the critical test cases here due to their parameter complexity.

### 3. API Endpoints (Medium Priority)

**Import/reimport:**
- POST /projects/import with the test .knxproj returns correct summary counts
- Reimport preserves manually-edited fields (names, comments) where possible
- Catalog data is populated after import

**CRUD operations:**
- Create/update/delete devices, GAs, spaces
- Audit log entries are created for each mutation
- Audit log detail shows before/after values

**Catalog:**
- GET /projects/:id/catalog returns correct sections and items
- POST /projects/:id/catalog/import handles .knxprod files

**Data integrity:**
- Deleting a project cascades to all related tables
- Deleting a device cascades to its com objects

### 4. Client State (Lower Priority)

**Reducers:**
- PATCH_DEVICE, PATCH_GA, PATCH_SPACE update the correct records
- RENAME_GA_GROUP updates all GAs in the group
- ADD_GA / DELETE_GA maintain sorted order
- ADD_DEVICE / DELETE_DEVICE work correctly

**Undo:**
- pushUndo captures only changed fields
- performUndo restores previous values
- Stack is capped at 50 items

## Test Framework

Use Node.js built-in test runner (`node --test`) for server-side tests. This keeps the test suite zero-dependency and aligns with the project's approach of minimizing external packages.

For client-side state tests, the reducers are pure functions that can be tested with the same Node.js test runner by importing them directly.

## Running Tests

```bash
# Run all tests
node --test tests/

# Run a specific test file
node --test tests/parser.test.js

# Run with verbose output
node --test --test-reporter spec tests/
```

## Generating Expected Output

Once the test .knxproj is available, a one-time script will:
1. Parse the project
2. Write the extracted data as JSON snapshots to `tests/fixtures/expected/`
3. These snapshots are manually reviewed against ETS6 to confirm correctness
4. Subsequent test runs compare parser output against these snapshots

For parameter memory, if ETS6 loaded images are not available, the alternative is:
1. Build memory images with the current code
2. Compare against a real device by reading back its memory after ETS6 programs it
3. Fix any discrepancies, then snapshot the corrected output as the reference
