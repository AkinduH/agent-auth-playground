# Workflow Editor

The Workflow Editor is the main canvas where you design and wire up your workflows using a drag-and-drop interface powered by React Flow.

---

## Layout

```
┌─────────────────────────────────────────────────────┐
│  Toolbar: + Chat Trigger  + AI Agent  + AI Service  │
│           + MCP Client    Delete Node               │
├──────────────────────────────────┬──────────────────┤
│                                  │                  │
│         React Flow Canvas        │   Right Panel:   │
│                                  │   Node Config    │
│   [ ] ──▶ [ ] ──▶ [ ]           │   or Chat        │
│                                  │                  │
│   Mini-map    Zoom controls      │                  │
└──────────────────────────────────┴──────────────────┘
```

The right panel alternates between:
- **Node configuration** — when a node is selected or double-clicked.
- **Chat panel** — when no node is selected (default state).

---

## Toolbar Actions

| Button | Action |
|--------|--------|
| **+ Chat Trigger** | Add a new Chat Trigger node |
| **+ AI Agent** | Add a new AI Agent node |
| **+ AI Service** | Add a new LLM node |
| **+ MCP Client** | Add a new MCP Client node |
| **Delete Node** | Delete the currently selected node (visible only when a node is selected) |

New nodes are placed at a default position on the canvas.

---

## Selecting and Configuring Nodes

### Click a node
Selects the node and opens its configuration panel on the right side.

### Double-click a node
Opens the configuration in a **modal dialog** instead of the side panel. Useful when the side panel is too narrow.

### Click on empty canvas
Deselects the current node and returns to the chat panel.

---

## Creating Connections (Edges)

1. Hover over a node until the handles appear (circles on the node borders).
2. Click and drag from a **source** handle to a **target** handle on another node.
3. Release to create the connection.

The canvas enforces connection rules — if a connection is not allowed, the drag will be rejected.

### Connection Rules

| Source Node | Source Handle | Allowed Target | Target Handle |
|-------------|---------------|----------------|---------------|
| Chat Trigger | Right | AI Agent | Left |
| AI Agent | Top | LLM only | Bottom |
| AI Agent | Right | MCP Client only | Left |

Attempting to drag an AI Agent's top handle to an MCP Client node (for example) will be silently rejected.

---

## Deleting Elements

### Delete a node
- Select the node, then click **Delete Node** in the toolbar.
- Or select the node, then press `Delete` or `Backspace`.

### Delete an edge
- Click the edge to select it.
- Press `Delete` or `Backspace`.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Delete` / `Backspace` | Delete the selected node |
| `Ctrl+Z` | Undo (browser default — may not apply to workflow state) |

---

## Canvas Controls

The canvas includes standard React Flow controls:

| Control | Description |
|---------|-------------|
| Scroll wheel | Zoom in / out |
| Click + drag (background) | Pan the canvas |
| Mini-map (bottom right) | Overview of the entire workflow; click to navigate |
| Zoom buttons | + / - / fit-to-screen |

---

## Node Appearance

Each node type has a distinct visual style:

| Node | Shape | Icon | Background |
|------|-------|------|------------|
| Chat Trigger | Square (80×80) | Chat bubble | Light gray |
| AI Agent | Rounded square (100×100) | Agent icon with shadow ring | — |
| LLM | Circle (80×80) | Provider logo (Google / OpenAI / Anthropic) | — |
| MCP Client | Circle (80×80) | MCP protocol icon | — |

### Active Glow Effect

When a node is actively executing, a pulsing glowing ring appears around it. The glow lasts a minimum of **1 second**, even for fast operations, to give visible feedback. The glow is driven by `node-start` / `node-end` SSE events from the server.

---

## Node Panel (Configuration UI)

The node panel renders differently depending on context:

| Variant | When shown | Width / Height |
|---------|------------|----------------|
| `sidebar` | Node selected via single click | Fixed 320 px right panel |
| `modal` | Node opened via double-click | Full-width modal, max 85 vh |

Both variants show the same fields. The modal is useful on smaller screens or when the configuration has many fields (e.g., MCP Client with OAuth2).

---

## Workflow Management

### Saving

Workflows are auto-saved to `localStorage` whenever you add, remove, or update a node or edge. There is no manual save button.

### Multiple Workflows

You can maintain multiple workflows. Use the workflow switcher (if present in the UI) to switch between them. Each workflow has its own:
- Node and edge graph
- Chat message history
- Agent memory
- OBO token cache

### Naming a Workflow

Workflow names can be set via the workflow switcher. The default name is auto-generated.

---

## Tips

- **Start with the Chat Trigger.** The validator will reject any workflow without one.
- **Wire the AI Agent's top handle to an LLM before running.** The validator enforces this.
- **Use double-click for MCP Client configuration.** The OAuth2 section has many fields that are easier to fill in the modal view.
- **Check the canvas mini-map** if nodes drift off screen during editing.
