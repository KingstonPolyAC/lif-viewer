# PolyField Track

A results viewing and display software package for FinishLynx and TimeTronics Photo Finish systems.

- Runs on **Windows** and **Mac** as a desktop device linked to your photo finish results folder.
- Enables a **web based user interface** for any device on the network to display results in multiple formats and a **self service kiosk mode** for athletes to search their own results.
- Keeps the operator in control, only displaying once a result is saved to ensure positive validation of results prior to display. Multiple saves are supported, enabling early display of athletes in distance races, or display once the top 3 athletes have performances assigned.

**Download from** - [www.polyfield.co.uk](https://www.polyfield.co.uk)

## How It Works

1. **Set the results directory** - this is the folder FinishLynx or TimeTronics will save your results into (LIF etc). Click the button in the top right corner, **"Select Results Folder"**.
2. Once set, the web user interface will build and access details will be displayed.
3. You only need **one instance** of the software to be running - multiple displays are supported, with the maximum determined by your network and the computer running the software.
4. You can change the results folder at any time by clicking **"Change Folder"** in the top right.

## Control Panel

Whilst the desktop app can perform all functions, it is advisable to leave it on the control panel screen and use a separate device or second screen connected to the web interface, leaving you in control of the Screensaver and Text display functions.

### Display Text & Screensaver

These enable you to display graphics or text messages on all connected displays, engaging your spectators. Sponsor graphics etc. can be shown this way.

- **Link Image** - attach a custom screensaver image (PNG format preferred)
- **Screensaver** - activate image display mode
- **Display** - send text messages to all connected screens
- **Clear** - cancel the graphics, or wait for the next result file save which will automatically override the graphics and return to result displays

### Text Size

The default text size can be adjusted with the **+** and **-** buttons.

### Rotation Mode

Determines how results with more than 8 competitors will display:

| Mode | Behaviour |
|------|-----------|
| **Scroll** | Top 3 rows are locked, rows 4+ will scroll through the remaining competitors |
| **Page** | Results will paginate showing 1-8, then 9-16, etc. on a rotation basis |
| **Scroll All** | All 8 rows will scroll through the competitors with no locked positions |

### Full Screen

- **Full Screen Table** - maximise results on the desktop display
- **Full Screen App** - maximise the entire window
- Press **Esc** to exit either mode

### Web Views

The web views are best accessed through the web interface using the access details provided at the top of the desktop app.

- **Multi Result Mode** - open the multi-result grid view
- **Athlete Search** - open the self-service athlete kiosk

## Multi Result View

The multi result view displays results in a **2x2** or **3x2** matrix layout.

- Can be configured to show the **latest results** or **rotate** through all available results
- Text size can be adapted
- **Full screen mode** hides the toolbar - any mouse movement will temporarily show the toolbar before hiding on inactivity again
- Results will paginate with a display of the current page at the top for tracking
- The **search icon** will take you to the self-service results kiosk

This can also be accessed by directly browsing to `http://<IP-ADDRESS>:3000/athlete`

## Athlete Search (Kiosk Mode)

A self-service screen where athletes can look up their own results.

1. The screen displays a **search bar** where an athlete can search by **name** or **bib number**, populating a dropdown list
2. Clicking on any name will display **all performances** of that athlete in the current results directory
3. Clicking on any **result card** will display that result in **full screen** for photo opportunities
4. **Reset** will clear the current search
5. The **Back** button in the top left will return to the search field

Access directly at `http://<IP-ADDRESS>:3000/athlete`

## Building from Source

### Prerequisites

- [Go](https://golang.org/dl/) (1.19 or later)
- [Node.js](https://nodejs.org/) (16 or later)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

### Build Commands

**macOS:**
```bash
wails build -platform darwin/amd64 -clean
```

**macOS Apple Silicon:**
```bash
wails build -platform darwin/arm64 -clean
```

**Windows:**
```bash
wails build -platform windows/amd64 -webview2 embed -clean
```

The `-webview2 embed` flag embeds the WebView2 runtime for Windows, ensuring the app works on systems without WebView2 installed.

## Support

- **Website:** [www.polyfield.co.uk](https://www.polyfield.co.uk)
- **Email:** support@polyfield.co.uk
- **PDF Manual:** See [docs/PolyField-Track-Manual.pdf](docs/PolyField-Track-Manual.pdf)
