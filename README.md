# AI Browser

A modern, privacy-focused web browser with integrated AI capabilities, built with Electron. Features an Arc-inspired design with a vertical tab rail, AI-powered chat sidebar, built-in ad blocking, and seamless context-aware conversations.

## Features

### Core Browsing
- **Modern Tab Management**: Vertical tab rail with favicon and title display
- **Smart Navigation**: Address bar with automatic protocol detection and search fallback
- **Incognito Mode**: Private browsing with ephemeral sessions (⌘⇧N)
- **Context Menus**: Full right-click support with cut/copy/paste, link operations, and inspect element
- **Session Persistence**: Automatically saves and restores tabs and window state
- **Window State Memory**: Remembers window size, position, maximized/fullscreen state

### AI Features
- **AI Chat Sidebar**: Toggle-able chat interface with streaming GPT-5 responses (⌘E)
- **Page Context Awareness**: AI can access and reference current page content
- **Multi-Tab Referencing**: Use `@tabname` to include content from other tabs in conversations
- **New Tab Chat**: Dedicated chat interface with Search/Ask mode toggle
- **Chat History**: Persistent storage of all AI conversations with titles and timestamps
- **Markdown Rendering**: AI responses rendered with full markdown support and code highlighting
- **Streaming Responses**: Real-time token-by-token streaming for responsive interactions

### Privacy & Performance
- **Ad Blocking**: Integrated Ghostery ad blocker with configurable toggle
- **Ad Statistics**: Real-time tracking of blocked/allowed requests
- **Session-Based Stats**: View both current session and cumulative blocking statistics
- **Persistent Settings**: Ad blocker preferences saved across sessions

### User Interface
- **Arc-Like Design**: Modern, minimalist interface with collapsible sidebars
- **Resizable Panels**: Adjustable tab rail and chat sidebar widths
- **Dark/Light Mode**: Full theme support with system preference detection
- **Toast Notifications**: Non-intrusive notification system
- **Quit Confirmation**: Large, prominent dialog to prevent accidental closure

### Additional Features
- **History Management**: Dual-tab interface for browsing history and AI chat archives
- **Settings Page**: Centralized configuration with ad blocker controls
- **Keyboard Shortcuts**: Comprehensive shortcuts for all major actions
- **Context Pills**: Visual representation of referenced tabs in chat
- **Quick Prompts**: Pre-defined prompt suggestions on new tab page

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Set up OpenAI API Key
Create a `.env` file in the project root:
```
OPENAI_API_KEY=your_openai_api_key_here
```

Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)

### 3. Start the application
```bash
npm start
```

### Build for distribution
```bash
npm run make
```

## Usage

### Tab Management
- **New Tab**: ⌘T or click the "New Tab" pill in the tab rail
- **Close Tab**: ⌘W or click the × button on the tab
- **Switch Tabs**: Click on any tab in the left sidebar, or use ⌘1-⌘9
- **Incognito Window**: ⌘⇧N for a new private browsing session

### Navigation
- **Address Bar**: Type URLs or search queries, press Enter
- **Back/Forward**: Click the navigation arrows or use browser gestures
- **Refresh**: ⌘R to reload the current page
- **Focus URL Bar**: ⌘L to quickly edit the URL

### AI Chat Sidebar
1. Press **⌘E** to toggle the chat sidebar
2. Type your question or prompt in the input area
3. Press **Enter** or click **Send** to start the conversation
4. Use **@** symbol to reference other tabs: type `@` and select from the dropdown
5. Click on context pills to remove referenced tabs
6. View chat history by clicking the history button
7. Clear conversation with the clear button

### New Tab AI Interface
1. Open a new tab (⌘T)
2. Toggle between **Search** and **Ask** modes using Tab key or clicking the toggle
3. **Search mode**: Quick URL navigation or web search
4. **Ask mode**: Full AI chat interface with quick prompt suggestions
5. Use `@` to reference other open tabs in your questions
6. Click suggested tabs to add them to your context

### Ad Blocking
1. Press **⌘,** to open Settings
2. Toggle the "Ad Blocking" switch on/off
3. View real-time statistics for:
   - Blocked requests (current session and total)
   - Allowed requests (current session and total)
4. Settings persist automatically across sessions

### History
1. Press **⌘Y** to open History
2. Switch between **Browsing History** and **AI Chats** tabs
3. **Browsing History**: View visited sites with timestamps and favicons
4. **AI Chats**: Access all saved conversations with previews
5. Click any item to open it
6. Hover to reveal delete button for individual items
7. Use "Clear All" to remove all entries

### Right-Click Menus
- **Text Selection**: Cut, Copy, Paste, Select All
- **Links**: Open in new tab, Copy link address
- **Images**: Copy image, Copy image address
- **Development**: Inspect Element

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘T | New Tab |
| ⌘W | Close Tab |
| ⌘⇧N | New Incognito Window |
| ⌘1-⌘9 | Switch to tab 1-9 |
| ⌘R | Refresh page |
| ⌘L | Focus URL bar |
| ⌘E | Toggle AI Chat sidebar |
| ⌘S | Toggle Tab Rail sidebar |
| ⌘Y | Open History |
| ⌘, | Open Settings |
| Tab | Toggle Search/Ask modes (in new tab) |

## Development

### Tech Stack
- **Framework**: Electron 37.2.1
- **AI**: OpenAI API (GPT-5) with streaming support
- **Ad Blocking**: @ghostery/adblocker-electron
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Build Tool**: Electron Forge
- **Markdown**: Marked.js for chat rendering

### Architecture

#### Main Process (index.js)
- Window creation and management
- IPC handlers for all renderer communications
- Menu system (application, window, edit, view, help)
- Session management and cookie persistence
- Ad blocker initialization
- WebView management and navigation

#### Renderer Process
- **Main Window** (`index.html`): Tab rail, webview container, chat sidebar
- **New Tab Page** (`newtab.html`): Dual-mode chat/search interface
- **Settings Page** (`settings.html`): Configuration UI
- **History Page** (`history.html`): Browsing and chat history viewer

#### Storage System
All data stored in JSON files in the user data directory:
- `history.json`: Browsing history (max 5000 entries)
- `chats.json`: AI conversation storage
- `tabs.json`: Open tabs and active state
- `windowState.json`: Window dimensions and position
- `adblocker.json`: Ad blocker settings and statistics

#### IPC Communication
Secure communication between main and renderer processes using contextBridge:
- Navigation control (back, forward, refresh, navigate-to)
- Tab management (create, close, save, load)
- Chat operations (send, stream, save, load, delete)
- History management (add, load, delete, clear)
- Settings (ad blocker toggle, stats)
- UI control (toggle sidebar, show dialogs)

### Security Features
- **Context Isolation**: Enabled for all renderer processes
- **Node Integration**: Disabled in renderers
- **Preload Script**: Safe API exposure through contextBridge
- **Web Security**: Enabled for iframe protections
- **Cookie Encryption**: Enabled via Electron Fuses
- **ASAR Integrity Validation**: Build-time integrity checks
- **Sandboxing**: Renderer processes sandboxed
- **API Key Protection**: Environment variables with .gitignore

### Design System
The app uses a comprehensive design system with:
- **Color Palette**: Light/dark theme with 9-level neutral scale
- **Typography**: 7-level font size scale with system fonts
- **Spacing**: 12-point grid system
- **Border Radius**: 5-level radius scale
- **Shadows**: 4-level depth system
- **Animations**: Consistent timing (150ms/250ms/350ms)
- **Responsive**: Media queries for smaller screens
- **Accessibility**: Focus management, ARIA labels, reduced-motion support

## Security

### API Key Protection
- Never commit secrets: `.env` is in `.gitignore`
- Use `.env.example` as a template

### If a key is leaked:
1. **Immediately rotate** the key in the OpenAI dashboard
2. **Remove from git history**:
   ```bash
   git filter-repo --path .env --invert-paths
   ```
   Or use git-filter-branch as fallback
3. **Invalidate cached artifacts** (hosting mirrors, CI/CD caches)

### Privacy
- **Incognito Mode**: Creates ephemeral sessions that don't persist data
- **Local Storage**: All data stored locally, never sent to third parties
- **Ad Blocking**: Blocks trackers and ads at the network level
- **No Telemetry**: Application doesn't collect or send usage data

## Contributing

Feel free to open a PR!

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- AI powered by [OpenAI](https://openai.com/)
- Ad blocking by [Ghostery](https://www.ghostery.com/)
- Design inspired by [Arc Browser](https://arc.net/)
