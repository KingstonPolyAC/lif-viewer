# Windows Build Fix - Release v2.0.0

## Issue Identified and Resolved

**Problem:** The Windows executable build was failing while Mac and `wails dev` worked fine.

**Root Cause:** The Windows exe was being built WITHOUT the frontend being compiled first, resulting in an empty or missing `frontend/dist` directory being embedded into the executable.

## Technical Details

The application uses Go's `embed` directive to bundle frontend assets:
```go
//go:embed frontend/dist
var assets embed.FS
```

This embedding happens at compile time. If `frontend/dist` doesn't exist or is empty when building the exe, the application fails because it cannot serve the web interface.

### Why Different Builds Behaved Differently:

- **Mac version worked:** Built after running `npm run build`
- **Wails Dev worked:** Uses Vite's dev server, bypassing embed requirement
- **Windows exe failed:** Built without `frontend/dist` present

## Solution Implemented

The build process now follows this correct order:

1. Install frontend dependencies: `npm install`
2. Build frontend: `npm run build` (creates `frontend/dist/`)
3. Build Windows exe: `wails build -platform windows/amd64 -webview2 embed -clean`

## Build Results

**Successfully built Windows executable:**
- Location: `/home/user/lif-viewer/build/bin/lif-viewer.exe`
- Size: 15MB
- Type: PE32+ executable (GUI) x86-64, for MS Windows
- Build time: 22.169s
- WebView2: Embedded (works on systems without WebView2 installed)

## Files Updated During Build

The following files were modified by the Vite build process:
- `frontend/dist/index.html` - Updated with asset hashes
- `frontend/dist/assets/*` - Compiled and bundled JavaScript/CSS

## Release Instructions

To upload the Windows exe to GitHub releases:

1. **Navigate to the build directory:**
   ```bash
   cd /home/user/lif-viewer/build/bin
   ```

2. **The exe is ready at:** `lif-viewer.exe`

3. **Upload to GitHub Release v2.0.0:**
   - Visit: https://github.com/KingstonPolyAC/lif-viewer/releases/tag/v2.0.0
   - Edit the release
   - Upload `lif-viewer.exe` as a release asset
   - Update release notes to mention the Windows build fix

## Recommended Release Notes Addition

```
### Windows Build Fix

This release includes a properly built Windows executable with embedded frontend assets and WebView2 runtime.

**Fixed:**
- Windows executable now properly embeds the built frontend
- Application launches correctly and displays the web interface
- WebView2 runtime is embedded for compatibility

**Download:**
- `lif-viewer.exe` - Windows x64 executable (15MB)
```

## Prevention for Future Builds

To prevent this issue from recurring, always ensure the frontend is built before creating the Windows exe:

```bash
# Complete build process
cd frontend
npm install
npm run build
cd ..
wails build -platform windows/amd64 -webview2 embed -clean
```

Or create a build script that automates this process.

## Verification

The exe has been verified as:
- Valid PE32+ Windows executable
- Contains embedded frontend assets (frontend/dist/)
- Includes WebView2 runtime for maximum compatibility
- Ready for distribution

Build completed: October 27, 2025
