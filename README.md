(yes this readme is outdated and written with ai, i will update it soon)


# AI Browser

A modern web browser with AI-powered features built with Electron.

## Features

- **AI Chat**: Ask questions about web pages and get contextual answers
- **New Tab AI**: Start conversations directly from the new tab page
- **Context Awareness**: Reference multiple tabs for comprehensive answers
- **Modern UI**: Clean, responsive interface with dark/light mode support

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up OpenAI API Key**:
   Create a `.env` file in the project root with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```
   
   Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)

## Security

- Never commit secrets: `.env` is already in `.gitignore`. Use `.env.example` as a template.
- If a key is ever leaked (e.g., accidentally committed):
  1. Immediately rotate the key in the OpenAI dashboard.
  2. Remove any committed secret files from the repo history.
     - Preferred (if available): `git filter-repo --path .env --invert-paths`
     - Fallback:
       ```bash
       git rm -f --cached .env
       git commit -m "chore(security): remove leaked .env"
       git filter-branch --force --index-filter \
         'git rm --cached --ignore-unmatch .env' \
         --prune-empty --tag-name-filter cat -- --all
       # Then force push the rewritten history
       git push --force --all
       git push --force --tags
       ```
  3. Invalidate any cached artifacts where the secret could persist (e.g., Git hosting mirrors/archives).

3. **Start the application**:
   ```bash
   npm start
   ```

## Usage

### AI Chat Sidebar
- Click the chat button (⌘E) to open the AI chat sidebar
- Ask questions about the current page or general topics
- Reference other tabs using `@tabname` syntax

### New Tab AI
- Open a new tab to access the AI chat interface
- Switch between "Search" and "Ask" modes
- Start conversations directly from the new tab page

### Keyboard Shortcuts
- `⌘T`: New tab
- `⌘W`: Close tab
- `⌘E`: Toggle AI chat sidebar
- `⌘K`: Focus input
- `⌘L`: Clear input
- `Tab`: Switch between search/ask modes (in new tab)
- `?`: Show keyboard shortcuts help

## Development

The application is built with:
- **Electron**: Cross-platform desktop app framework
- **OpenAI API**: AI chat functionality
- **Vanilla JavaScript**: Frontend implementation

### Project Structure
- `src/index.js`: Main Electron process
- `src/index.html`: Main browser interface
- `src/newtab.html`: New tab page with AI chat
- `src/openaiHelper.js`: OpenAI API integration
- `src/preload.js`: IPC bridge for renderer process 
