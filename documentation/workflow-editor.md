# Workflow Editor

The Workflow Editor is the main canvas where you design workflows by placing and connecting nodes.

---

## Layout

```
┌─────────────────────────────────────────────────────┐
│  Toolbar: + Chat Trigger  + AI Agent  + AI Service  │
│           + MCP Client    Delete Node               │
├──────────────────────────────────┬──────────────────┤
│                                  │                  │
│           Canvas                 │   Right Panel:   │
│                                  │   Node Config    │
│   [ ] ──▶ [ ] ──▶ [ ]           │   or Chat        │
│                                  │                  │
│   Mini-map    Zoom controls      │                  │
└──────────────────────────────────┴──────────────────┘
```

The right panel switches between:
- **Node configuration** — when a node is selected
- **Chat panel** — when nothing is selected (the default view)

---

## Toolbar

| Button | What it does |
|--------|--------------|
| **+ Chat Trigger** | Add a Chat Trigger node |
| **+ AI Agent** | Add an AI Agent node |
| **+ AI Service** | Add an AI Service (LLM) node |
| **+ MCP Client** | Add an MCP Client node |
| **Delete Node** | Delete the selected node (appears only when a node is selected) |

New nodes are placed in a default position on the canvas. Drag them to rearrange.

---

## Selecting and Configuring Nodes

**Single click** — selects the node and opens its configuration in the right panel.

**Double-click** — opens the configuration in a larger modal dialog. Useful for nodes with many fields (like an MCP Client with OAuth2 enabled) or on smaller screens.

**Click on empty canvas** — deselects the current node and returns to the chat panel.

---

## Creating Connections

1. Hover over a node until small circles (handles) appear on its edges.
2. Click and drag from a **source** handle to a **target** handle on another node.
3. Release to create the connection. An animated edge will appear.

The canvas enforces connection rules — if a connection is not allowed (for example, connecting an AI Agent's top handle to an MCP Client), the drag will be rejected silently.

### Connection Rules

| From node | From handle | To node | To handle |
|-----------|-------------|---------|-----------|
| Chat Trigger | Right | AI Agent | Left |
| AI Agent | Top | AI Service | Bottom |
| AI Agent | Right | MCP Client | Left |

---

## Deleting Elements

### Delete a node

Select the node, then either:
- Click **Delete Node** in the toolbar
- Press `Delete` or `Backspace` on your keyboard

### Delete a connection (edge)

Click the edge line to select it, then press `Delete` or `Backspace`.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Delete` / `Backspace` | Delete the selected node or edge |

---

## Canvas Controls

| Control | Description |
|---------|-------------|
| Scroll wheel | Zoom in / out |
| Click and drag (background) | Pan the canvas |
| Mini-map (bottom right) | Overview of the workflow; click to navigate |
| Zoom buttons | Zoom in, zoom out, or fit everything to screen |

---

## Node Appearance

Each node type has a distinct visual style so you can tell them apart at a glance.

| Node | Shape |
|------|-------|
| Chat Trigger | Square with chat bubble icon |
| AI Agent | Rounded square with agent icon |
| AI Service | Circle with provider logo |
| MCP Client | Circle with MCP protocol icon |

### Active Glow Effect

When a node is executing, a pulsing glowing ring appears around it. The glow lasts at least one second so you can see it even for fast operations. Once the node finishes, the glow fades.

---

## Managing Workflows

### Auto-save

Workflows are saved automatically whenever you add, remove, or change a node or edge. There is no manual save button.

### Multiple Workflows

You can maintain multiple workflows. Use the workflow switcher to move between them. Each workflow has its own canvas, chat history, agent memory, and auth token cache.

### Naming a Workflow

Set the workflow name using the workflow switcher at the top. The default name is auto-generated.

---

## Tips

- Start every workflow with a **Chat Trigger** — the validator will reject any workflow without one.
- Connect the **AI Agent's top handle to an AI Service** before running — this connection is required.
- Use **double-click** to configure MCP Client nodes — the OAuth2 fields are easier to fill in the larger modal.
- If nodes drift off screen, click the fit-to-screen button in the zoom controls.
