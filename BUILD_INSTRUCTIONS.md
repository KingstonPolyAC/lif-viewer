# LIF Viewer - Windows Executable Build Instructions

Complete step-by-step guide to build the Windows executable for the LIF Viewer application.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Build Process](#build-process)
4. [Verification](#verification)
5. [Troubleshooting](#troubleshooting)
6. [Release Process](#release-process)

---

## Prerequisites

### Required Software

#### 1. Go Programming Language
- **Version:** 1.19 or later (tested with 1.24.7)
- **Download:** https://golang.org/dl/
- **Installation:**
  ```bash
  # Linux/macOS
  wget https://go.dev/dl/go1.24.7.linux-amd64.tar.gz
  sudo tar -C /usr/local -xzf go1.24.7.linux-amd64.tar.gz
  export PATH=$PATH:/usr/local/go/bin

  # Windows
  # Download and run the MSI installer from golang.org
  ```

#### 2. Node.js and npm
- **Version:** Node.js 16 or later
- **Download:** https://nodejs.org/
- **Installation:**
  ```bash
  # Linux (Ubuntu/Debian)
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs

  # macOS (using Homebrew)
  brew install node

  # Windows
  # Download and run the MSI installer from nodejs.org
  ```

#### 3. Wails CLI
- **Version:** v2.10.2 or later
- **Installation:**
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest

  # Add Go bin to PATH if not already done
  export PATH=$PATH:$HOME/go/bin  # Linux/macOS
  # Or add %USERPROFILE%\go\bin to PATH on Windows
  ```

#### 4. Platform-Specific Requirements

**For Windows Builds:**
- Windows 10 or later
- WebView2 Runtime (embedded in build, not required for building)
- MinGW-w64 (for cross-compilation from Linux/macOS)

**For Cross-Compilation from Linux/macOS:**
```bash
# Install MinGW-w64
# Ubuntu/Debian
sudo apt-get install mingw-w64

# macOS
brew install mingw-w64
```

---

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/KingstonPolyAC/lif-viewer.git
cd lif-viewer
```

### 2. Verify Go Installation

```bash
go version
# Should output: go version go1.24.7 (or your installed version)
```

### 3. Verify Node.js Installation

```bash
node --version
# Should output: v20.x.x (or your installed version)

npm --version
# Should output: 10.x.x (or your npm version)
```

### 4. Verify Wails Installation

```bash
wails version
# Should output: v2.10.2 (or later)
```

### 5. Set Up Go Proxy (If Behind Firewall)

```bash
# Use direct connections to avoid proxy issues
export GOPROXY=direct

# Or use the default Go proxy
export GOPROXY=https://proxy.golang.org,direct
```

---

## Build Process

### **CRITICAL: Build Order Matters!**

The Windows executable build **MUST** follow this exact order:

1. Install frontend dependencies
2. Build the frontend
3. Build the Wails application

**Why?** The Wails build embeds `frontend/dist/` at compile time. If the frontend isn't built first, the exe will be missing the web interface.

---

### Step 1: Install Frontend Dependencies

```bash
cd frontend
npm install
```

**Expected Output:**
```
added 73 packages, and audited 74 packages in 4s
```

**What This Does:**
- Installs React, Vite, and all required npm packages
- Creates `node_modules/` directory
- Prepares the frontend build environment

---

### Step 2: Build the Frontend

```bash
npm run build
```

**Expected Output:**
```
vite v6.3.5 building for production...
transforming...
✓ 43 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     0.60 kB │ gzip:  0.42 kB
dist/assets/index-XXXXXXXX.js     206.82 kB │ gzip: 65.86 kB
dist/assets/index-XXXXXXXX.css      0.30 kB │ gzip:  0.23 kB
✓ built in 1.10s
```

**What This Does:**
- Compiles React components to optimized JavaScript
- Bundles all assets (CSS, images, fonts)
- Creates `frontend/dist/` directory
- Generates production-ready files with content hashes

**Verify the Build:**
```bash
ls -lh dist/
# Should show index.html and assets/ directory
```

---

### Step 3: Return to Project Root

```bash
cd ..
# You should now be in the lif-viewer/ directory
```

---

### Step 4: Build the Windows Executable

#### Option A: Build on Windows (Native)

```bash
wails build -clean
```

#### Option B: Cross-Compile from Linux/macOS

```bash
wails build -platform windows/amd64 -webview2 embed -clean
```

**Build Flags Explained:**
- `-platform windows/amd64` - Target Windows 64-bit
- `-webview2 embed` - Embed WebView2 runtime (no installation required)
- `-clean` - Clean the build directory before building

**Expected Output:**
```
Wails CLI v2.10.2

Build Options
Platform(s)       | windows/amd64
Compiler          | /usr/local/go/bin/go
Build Mode        | production
Devtools          | false
Frontend Directory| /path/to/lif-viewer/frontend
Clean Bin Dir     | true

Building target: windows/amd64
  • Generating bindings: Done.
  • Installing frontend dependencies: Done.
  • Compiling frontend: Done.
  • Generating application assets: Done.
  • Compiling application: Done.

Built '/path/to/lif-viewer/build/bin/lif-viewer.exe' in 22.169s.
```

**Build Time:** Approximately 20-30 seconds depending on system performance.

---

## Verification

### Step 1: Check the Executable Exists

```bash
ls -lh build/bin/lif-viewer.exe
```

**Expected Output:**
```
-rwxr-xr-x 1 user user 15M Oct 27 21:00 build/bin/lif-viewer.exe
```

### Step 2: Verify File Type

```bash
file build/bin/lif-viewer.exe
```

**Expected Output:**
```
build/bin/lif-viewer.exe: PE32+ executable (GUI) x86-64, for MS Windows
```

### Step 3: Calculate Checksums

```bash
# MD5
md5sum build/bin/lif-viewer.exe

# SHA256
sha256sum build/bin/lif-viewer.exe
```

**Save these checksums for distribution verification!**

### Step 4: Test the Executable (Windows Only)

```bash
# Run the executable
./build/bin/lif-viewer.exe
```

**Expected Behavior:**
1. Application window opens
2. Shows "KACPH LIF Display" interface
3. "Select Results Directory" button is functional
4. No error dialogs appear

---

## Troubleshooting

### Problem 1: Frontend Not Built

**Symptom:** Exe file is small (< 5MB) or shows blank screen when run

**Cause:** Frontend wasn't built before Wails compilation

**Solution:**
```bash
cd frontend
rm -rf dist/  # Clean any old builds
npm run build  # Rebuild frontend
cd ..
wails build -platform windows/amd64 -webview2 embed -clean
```

---

### Problem 2: "command not found: wails"

**Cause:** Wails CLI not in PATH

**Solution:**
```bash
# Add Go bin to PATH
export PATH=$PATH:$HOME/go/bin  # Linux/macOS

# Or on Windows, add to System PATH:
# %USERPROFILE%\go\bin
```

**Verify:**
```bash
which wails  # Should show path to wails executable
```

---

### Problem 3: Network Errors During Build

**Symptom:**
```
Error: dial tcp: lookup storage.googleapis.com: connection refused
```

**Cause:** Go proxy cannot be reached

**Solution:**
```bash
# Use direct mode
export GOPROXY=direct
go mod download  # Download dependencies first
wails build -platform windows/amd64 -webview2 embed -clean
```

---

### Problem 4: "go.mod version mismatch"

**Symptom:**
```
Warning: go.mod is using Wails '2.10.1' but the CLI is 'v2.10.2'
```

**Cause:** Wails version in go.mod is older

**Solution:**
```bash
# Update go.mod
go get github.com/wailsapp/wails/v2@latest
go mod tidy

# Rebuild
wails build -platform windows/amd64 -webview2 embed -clean
```

---

### Problem 5: npm Install Fails

**Symptom:**
```
npm ERR! network error
```

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Use different registry if needed
npm config set registry https://registry.npmjs.org/

# Retry installation
cd frontend
npm install
```

---

### Problem 6: Build Succeeds But Exe Won't Run

**Possible Causes:**
1. Missing WebView2 (use `-webview2 embed` flag)
2. Antivirus blocking the exe
3. Corrupted build

**Solutions:**
```bash
# Rebuild with embedded WebView2
wails build -platform windows/amd64 -webview2 embed -clean

# If antivirus is blocking, add exception for:
# - build/bin/lif-viewer.exe
# - Your project directory
```

---

## Complete Build Script

For convenience, here's a complete build script:

### Linux/macOS: `build.sh`

```bash
#!/bin/bash
set -e  # Exit on error

echo "=== LIF Viewer Windows Build Script ==="
echo ""

# Check prerequisites
echo "Checking prerequisites..."
command -v go >/dev/null 2>&1 || { echo "Error: Go is not installed"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is not installed"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is not installed"; exit 1; }
command -v wails >/dev/null 2>&1 || { echo "Error: Wails is not installed"; exit 1; }

# Display versions
echo "Go version: $(go version)"
echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"
echo "Wails version: $(wails version | head -n 1)"
echo ""

# Set Go proxy
export GOPROXY=direct
echo "Using GOPROXY=direct"
echo ""

# Step 1: Install frontend dependencies
echo "Step 1: Installing frontend dependencies..."
cd frontend
npm install
echo "✓ Frontend dependencies installed"
echo ""

# Step 2: Build frontend
echo "Step 2: Building frontend..."
npm run build
echo "✓ Frontend built successfully"
echo ""

# Verify frontend build
if [ ! -f "dist/index.html" ]; then
    echo "Error: Frontend build failed - dist/index.html not found"
    exit 1
fi
echo "✓ Frontend build verified"
echo ""

# Step 3: Return to root
cd ..

# Step 4: Build Windows executable
echo "Step 3: Building Windows executable..."
wails build -platform windows/amd64 -webview2 embed -clean

# Verify executable
if [ ! -f "build/bin/lif-viewer.exe" ]; then
    echo "Error: Windows exe not found"
    exit 1
fi

echo ""
echo "=== Build Complete! ==="
echo ""
echo "Executable location: build/bin/lif-viewer.exe"
echo "Size: $(ls -lh build/bin/lif-viewer.exe | awk '{print $5}')"
echo ""
echo "Checksums:"
echo "MD5:    $(md5sum build/bin/lif-viewer.exe | awk '{print $1}')"
echo "SHA256: $(sha256sum build/bin/lif-viewer.exe | awk '{print $1}')"
echo ""
```

### Windows: `build.bat`

```batch
@echo off
setlocal enabledelayedexpansion

echo === LIF Viewer Windows Build Script ===
echo.

REM Check prerequisites
where go >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Go is not installed
    exit /b 1
)

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed
    exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: npm is not installed
    exit /b 1
)

where wails >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Error: Wails is not installed
    exit /b 1
)

echo Checking versions...
go version
node --version
npm --version
wails version
echo.

REM Step 1: Install frontend dependencies
echo Step 1: Installing frontend dependencies...
cd frontend
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo Error: npm install failed
    exit /b 1
)
echo [OK] Frontend dependencies installed
echo.

REM Step 2: Build frontend
echo Step 2: Building frontend...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo Error: Frontend build failed
    exit /b 1
)
echo [OK] Frontend built successfully
echo.

REM Verify frontend build
if not exist "dist\index.html" (
    echo Error: Frontend build failed - dist\index.html not found
    exit /b 1
)
echo [OK] Frontend build verified
echo.

REM Step 3: Return to root
cd ..

REM Step 4: Build Windows executable
echo Step 3: Building Windows executable...
wails build -platform windows/amd64 -webview2 embed -clean

REM Verify executable
if not exist "build\bin\lif-viewer.exe" (
    echo Error: Windows exe not found
    exit /b 1
)

echo.
echo === Build Complete! ===
echo.
echo Executable location: build\bin\lif-viewer.exe
dir /s build\bin\lif-viewer.exe | find "lif-viewer.exe"
echo.
certutil -hashfile build\bin\lif-viewer.exe MD5
certutil -hashfile build\bin\lif-viewer.exe SHA256
echo.
```

**To use the build script:**

```bash
# Linux/macOS
chmod +x build.sh
./build.sh

# Windows
build.bat
```

---

## Release Process

### Step 1: Create Release Artifacts

```bash
# Create artifacts directory
mkdir -p artifacts/lif-viewer-v2.0.1

# Copy executable
cp build/bin/lif-viewer.exe artifacts/lif-viewer-v2.0.1/

# Generate checksums
cd artifacts/lif-viewer-v2.0.1/
md5sum lif-viewer.exe > lif-viewer.exe.md5
sha256sum lif-viewer.exe > lif-viewer.exe.sha256
```

### Step 2: Create Release on GitHub

1. **Tag the release:**
   ```bash
   git tag -a v2.0.1 -m "Release V2.0.1 - Windows Build Fix"
   git push origin v2.0.1
   ```

2. **Create release on GitHub:**
   - Visit: https://github.com/KingstonPolyAC/lif-viewer/releases/new
   - Tag: `v2.0.1`
   - Title: `Release V2.0.1 - Windows Build Fix`
   - Upload: `lif-viewer.exe`

3. **Add release notes:**
   ```markdown
   ## Windows Build Fix

   This release includes a properly built Windows executable.

   ### Fixed
   - Windows executable now properly embeds the built frontend
   - WebView2 runtime is embedded for maximum compatibility

   ### Downloads
   - **lif-viewer.exe** (15MB) - Windows x64 executable

   ### Verification
   - MD5: [paste from .md5 file]
   - SHA256: [paste from .sha256 file]
   ```

---

## Quick Reference

### Minimum Build Commands

```bash
cd frontend && npm install && npm run build && cd ..
wails build -platform windows/amd64 -webview2 embed -clean
```

### Output Location

```
build/bin/lif-viewer.exe
```

### Typical File Size

```
~15MB (15,728,640 bytes)
```

### Build Time

```
~20-30 seconds on modern hardware
```

---

## Additional Resources

- **Wails Documentation:** https://wails.io/docs/
- **Go Documentation:** https://golang.org/doc/
- **Vite Documentation:** https://vitejs.dev/
- **React Documentation:** https://react.dev/

---

## Support

For build issues:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review build logs for specific errors
3. Report issues at: https://github.com/KingstonPolyAC/lif-viewer/issues

**Build Date:** October 27, 2025
**Author:** Gordon Lester (web@kingstonandpoly.org)
