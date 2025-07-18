# KACPH LIF Display

A real-time athletics results display application built with Go (Wails) backend and React frontend. Monitors .lif files from FinishLynx timing systems and displays competition results with multiple viewing modes.

## Features

- **Real-time Monitoring**: Automatically detects and displays new .lif files from your results directory
- **Multiple Display Modes**: 
  - Single event display with competitor rotation
  - Multi-event grid view (2x2 or 3x2 layouts)
  - Full-screen viewing options
- **Smart Result Handling**: 
  - Proper sorting by performance times
  - DNF/DQ results displayed at bottom with blank positions
  - DNS entries filtered out entirely
- **Interactive Controls**:
  - Adjustable text sizing
  - Screensaver mode with custom images
  - Text overlay for announcements
  - Web interface access for remote viewing

## Recent Bug Fixes

✅ **Space Bar Hotkey Removed**: Space bar no longer exits full-screen mode (preventing conflicts with text input)

✅ **LIF Data Priority**: New competition results automatically override screensaver and text displays

✅ **DNS Filtering**: DNS (Did Not Start) entries are completely filtered out

✅ **DNF/DQ Handling**: DNF and DQ results properly displayed with blank positions at the end of results

## Building from Source

### Prerequisites
- [Go](https://golang.org/dl/) (1.19 or later)
- [Node.js](https://nodejs.org/) (16 or later)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

### Build Commands

**Development Build:**
```bash
wails build
```

**Windows Production Build:**
```bash
wails build -platform windows/amd64 -webview2 embed -clean
```

**Cross-Platform Builds:**
```bash
# macOS
wails build -platform darwin/amd64 -clean

# macOS Apple Silicon
wails build -platform darwin/arm64 -clean

# Linux
wails build -platform linux/amd64 -clean
```

The `-webview2 embed` flag embeds the WebView2 runtime for Windows, ensuring the app works on systems without WebView2 installed.

## Quick Start

1. **Launch Application**: Run the executable
2. **Select Directory**: Click "Select Results Directory" and choose your .lif files folder
3. **Monitor Results**: The app will automatically display new results as they're generated
4. **Access Web Interface**: Use the provided URLs for remote viewing

## Controls

### Keyboard Shortcuts
- **Escape**: Exit full-screen modes

### Display Options
- **Full Screen Table**: Expand current event to full screen
- **Full Screen App**: Put entire application in full screen
- **Text Size**: Adjust font size with Smaller/Larger buttons
- **Multi LIF Mode**: Switch to grid view of multiple events

### Advanced Features
- **Link Image**: Add custom screensaver image (PNG format preffered)
- **Screensaver**: Activate image display mode
- **Text Display**: Add custom announcement text overlay

## File Format Support

The application processes .lif files with the following expected structure:
- **Header Row**: Event name, wind conditions, timestamps
- **Competitor Rows**: Place, ID, names, affiliation, performance times
- **Character Encoding**: Auto-detects UTF-8, UTF-16LE/BE, Windows-1252, ISO-8859-1

## Web Interface

Access the web interface at:
- Local: `http://localhost:3000`
- Network: `http://[your-ip]:3000`

The web interface provides the same functionality as the desktop app for remote viewing.

## System Requirements

- **Operating System**: Windows 10 or Windows 11
- **Memory**: Recommended 2GB RAM
- **Storage**: 50MB available space
- **Network**: LAN connection for web interface access

## Typical Setup Workflow

### For KACPH Events
1. **Setup Photofinish Equipment**: Configure your FinishLynx timing system, ensuing a .lif is saved once a race is read
2. **Launch Application**: Run the KACPH LIF Display executable
3. **Link Results Directory**: Select the folder where Lynx exports .lif files
4. **Full Screen Display**: Use "Full Screen App" for optimal scoreboard presentation
5. **Remote Access**: Share the displayed LAN IP with officials for remote viewing

### For Other Venues
1. **Setup Equipment**: Configure timing system and export directory
2. **Launch Application**: Run the executable
3. **Select Display Mode**: Choose between single event or multi-event grid
4. **Remote Displays**: Use the web interface URL for additional screens throughout the facility

## Technical Specifications

### File Handling
- **Concurrent Files**: Supports monitoring up to 250 .lif files simultaneously. Beyond this is untested but possible.
- **Competitors per Event**: No limit on number of competitors
- **File Formats**: Unicode and single-byte character encoding supported
- **Error Handling**: Displays partial results if key data is in correct CSV positions

### Display Behavior
- **Competitor Rotation**: Events with >8 competitors lock top 3 places, cycle through remaining competitors
- **Event Priority**: Latest events automatically take display priority
- **Wind Display**: Shows wind readings in m/s format as exported by Lynx
- **Time Format**: Displays times exactly as saved by Lynx (no manual vs automatic differentiation)

### Network Features
- **Local Operation**: Runs independently without WAN connection
- **LAN Access**: Web interface available on local network via displayed IP
- **Remote Viewing**: Multiple screens can connect for facility-wide displays
- **Directory Updates**: Can change monitored directory within the app

## Deployment Information

### Installation
- **Type**: Single executable file (.exe)
- **Installation**: No installation required - run directly
- **Updates**: Replace executable with new version
- **Configuration**: No configuration files - settings are session-based

### Customization
- **Branding**: Source code modification required for custom branding
- **Export Options**: No built-in export functionality
- **Integration**: Standalone application - no external system integration

## Limitations

- **File Corruption**: Minimal detection and correction capabilities
- **Remote Directories**: Network loss may affect remote directory monitoring
- **Export Features**: No result export or save functionality
- **System Integration**: No integration with other athletics software
