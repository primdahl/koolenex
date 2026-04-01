# Dynamic Section Parser Refactor

## Problem

The ETS application program XML has a `<Dynamic>` section that defines the parameter UI structure. The current parser uses `fast-xml-parser` which groups child elements by tag name, losing document order. This causes:

1. **ParameterSeparator** elements (headings, info boxes, rulers) can't be properly associated with the parameters they precede
2. **Table layouts** (`Layout="Table"` with `Rows`, `Columns`, `Cell` attributes) lose the interleaving of cell assignments and choose/when blocks
3. **Section ordering** (ChannelIndependentBlock vs Channel) is lost
4. **Inline blocks** (`Inline="true"`) aren't properly handled

Multiple regex-based hacks on the raw XML were added to work around these issues, all of which are fragile and incorrect.

## Solution

Use `fast-xml-parser` with `preserveOrder: true` for the Dynamic section. This returns an ordered array of elements preserving the exact document structure.

### What `preserveOrder: true` returns

Instead of:
```javascript
{
  ParameterRefRef: [{ '@_RefId': '...' }, ...],
  ParameterSeparator: [{ '@_Text': '...' }, ...],
  choose: [{ when: [...] }, ...]
}
```

It returns:
```javascript
[
  { ParameterSeparator: [], ':@': { '@_Id': '...', '@_Text': '...', '@_UIHint': 'Headline' } },
  { ParameterRefRef: [], ':@': { '@_RefId': '...' } },
  { choose: [{ when: [...] }], ':@': { '@_ParamRefId': '...' } },
]
```

Each element is a single-key object where the key is the tag name, the value is the children array, and `:@` contains attributes.

### Scope of Change

1. **buildAppIndex** — the `serNode` and `serDyn` functions that serialize the Dynamic tree need to work with the ordered format
2. **walkDynamic** (section map builder) — needs to walk the ordered tree instead of separate arrays
3. **evalDynamic** (activity calculator) — needs to walk the ordered tree
4. **buildParamModel** — remove all regex hacks, derive everything from the structured tree
5. **Client-side** — `evalDynTree` and `walkDynSection` in DeviceParameters.jsx need to handle the new dynTree format

### What the new dynTree format should look like

Instead of separate `channels`, `cib`, `pb`, `choices` arrays, use a single ordered `items` array:

```javascript
{
  items: [
    { type: 'cib', node: { items: [...] } },
    { type: 'channel', label: 'Device settings', node: { items: [...] } },
    { type: 'channel', label: 'Manual operation', node: { items: [...] } },
    ...
  ]
}
```

Each node's `items` array contains elements in document order:
```javascript
{
  items: [
    { type: 'separator', text: 'Channel configuration', uiHint: 'Headline' },
    { type: 'paramRef', refId: '...', cell: '1,1' },
    { type: 'block', inline: true, layout: 'Table', rows: [...], columns: [...], node: { items: [...] } },
    { type: 'choose', paramRefId: '...', whens: [{ test: '!=0', node: { items: [...] } }] },
    { type: 'assign', target: '...', source: '...', value: '...' },
  ]
}
```

### Backwards Compatibility

The cached app model JSON files in `data/apps/` will need to be regenerated (reimport projects). The old format with `channels`/`cib`/`pb`/`choices` will no longer work.

### Elements to Preserve

All elements in the Dynamic section should be represented:

| XML Element | dynTree item type | Key attributes |
|---|---|---|
| ChannelIndependentBlock | `cib` | - |
| Channel | `channel` | Id, Text/Name (label) |
| ParameterBlock | `block` | Id, Text/Name, Inline, Layout, Rows, Columns |
| ParameterRefRef | `paramRef` | RefId, Cell |
| ParameterSeparator | `separator` | Id, Text, UIHint |
| choose | `choose` | ParamRefId |
| when | (inside choose) | test, default |
| Assign | `assign` | TargetParamRefRef, SourceParamRefRef, Value |
| ComObjectRefRef | `comRef` | RefId |
| Row | (inside block tableLayout) | Id, Name, Text |
| Column | (inside block tableLayout) | Id, Text, Width |

### Migration Plan

1. Add a second XML parser instance with `preserveOrder: true`
2. Parse only the Dynamic section with it (keep everything else as-is)
3. Rewrite `serNode` and `serDyn` to produce the new ordered format
4. Remove all raw-XML regex hacks
5. Update client `evalDynTree` and `walkDynSection` for new format
6. Update `renderSectionContent` (already partially done)
