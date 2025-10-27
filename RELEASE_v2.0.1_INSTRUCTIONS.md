# Release v2.0.1 Instructions

## Windows Executable Built Successfully ✅

**Location:** `/home/user/lif-viewer/build/bin/lif-viewer.exe`
**Size:** 15MB
**Type:** PE32+ executable (GUI) x86-64, for MS Windows
**WebView2:** Embedded (works without WebView2 installed)

---

## Quick Release Instructions (For Phone)

Since you're on a phone, here are the simplest steps to create the release:

### Option 1: Create Release on GitHub Mobile

1. **Open GitHub Mobile App** or visit: https://github.com/KingstonPolyAC/lif-viewer

2. **Create the Release:**
   - Go to "Releases" section
   - Tap "Create a new release" (or use the '+' icon)

3. **Fill in Release Details:**
   - **Tag:** `v2.0.1`
   - **Target:** Select the branch `claude/debug-windows-build-011CUYNCL3JWdW2g7HoMhg25` or `main`
   - **Title:** `Release V2.0.1 - Windows Build Fix`

4. **Release Description:**
```markdown
## Windows Build Fix

This release includes a properly built Windows executable with embedded frontend assets.

### Fixed
✅ Windows executable now properly embeds the built frontend (frontend/dist/)
✅ Application launches correctly and displays the web interface
✅ WebView2 runtime is embedded for maximum compatibility

### Technical Details
The previous Windows build was missing the compiled frontend assets because the build was executed before running `npm run build`. This release ensures the complete build process is followed.

### What's Included
- Windows x64 executable (15MB) with embedded WebView2
- All features from v2.0.0:
  - Major UI overhaul with CSS Grid layout
  - Enhanced synchronization between desktop and web interface
  - Support for .lif, .res, and .txt (MacFinish) file formats
  - Improved rotation modes (scroll, page, scrollAll)
  - Better handling of DNF/DQ/DNS results
  - Column width optimizations

### Download
The Windows executable will be attached after release creation.

**Build date:** October 27, 2025
```

5. **Publish Release:**
   - Tap "Publish release"
   - Note: The exe file will need to be uploaded from a computer later

---

## Option 2: Complete from Computer Later

When you have access to a computer:

### Step 1: Merge the Branch (Optional but Recommended)

```bash
git checkout main
git merge claude/debug-windows-build-011CUYNCL3JWdW2g7HoMhg25
git push origin main
```

### Step 2: Create and Push the Tag

```bash
git tag -a v2.0.1 -m "Release V2.0.1 - Windows Build Fix"
git push origin v2.0.1
```

### Step 3: Create the Release on GitHub

Using GitHub CLI:
```bash
gh release create v2.0.1 \
  --title "Release V2.0.1 - Windows Build Fix" \
  --notes-file RELEASE_v2.0.1_INSTRUCTIONS.md \
  build/bin/lif-viewer.exe
```

Or manually:
1. Visit: https://github.com/KingstonPolyAC/lif-viewer/releases/new
2. Select tag: `v2.0.1`
3. Copy the release description from above
4. Upload `build/bin/lif-viewer.exe`
5. Publish release

---

## Option 3: Quick Web Interface (Simplest for Phone)

1. **Visit:** https://github.com/KingstonPolyAC/lif-viewer/releases/new

2. **Quick Form Fill:**
   - Tag: `v2.0.1`
   - Title: `Release V2.0.1 - Windows Build Fix`
   - Description: Paste the markdown above
   - Check "Set as the latest release"

3. **Publish** (exe can be added later)

---

## Uploading the Windows Executable

The exe file is located at:
```
/home/user/lif-viewer/build/bin/lif-viewer.exe
```

### From Computer:
- Download the file from the server
- Visit the release page
- Click "Edit release"
- Drag and drop `lif-viewer.exe` into the assets section
- Save

### Alternative - Direct Upload via API:
```bash
# First, get the release upload URL
UPLOAD_URL=$(gh api repos/KingstonPolyAC/lif-viewer/releases/tags/v2.0.1 --jq .upload_url | sed 's/{?name,label}//')

# Upload the exe
gh api --method POST "${UPLOAD_URL}?name=lif-viewer.exe" \
  --input build/bin/lif-viewer.exe \
  -H "Content-Type: application/octet-stream"
```

---

## Verification Checklist

After creating the release, verify:

- [ ] Release shows up at: https://github.com/KingstonPolyAC/lif-viewer/releases
- [ ] Tag v2.0.1 is visible
- [ ] Release is marked as "Latest"
- [ ] Release description is complete
- [ ] `lif-viewer.exe` is attached as an asset (can be added later)

---

## Release Summary

**Version:** v2.0.1
**Purpose:** Windows build fix with properly embedded frontend
**Executable:** lif-viewer.exe (15MB, PE32+, x86-64)
**WebView2:** Embedded
**Build Date:** October 27, 2025
**Branch:** claude/debug-windows-build-011CUYNCL3JWdW2g7HoMhg25

---

## Notes

- The tag v2.0.1 has been created locally
- The Windows exe is fully built and ready
- The exe includes all frontend assets (frontend/dist/)
- Documentation has been committed and pushed
- Ready for release creation when convenient
