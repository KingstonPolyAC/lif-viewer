package main

import (
	"context"
	"embed"
	"encoding/csv"
	"fmt"
	"io"
	"io/fs"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/filesystem"
	"github.com/saintfish/chardet"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/encoding/unicode"
	"golang.org/x/text/transform"
)

// Embed frontend assets.
//
//go:embed frontend/dist
var assets embed.FS

// Competitor holds the information for each competitor.
type Competitor struct {
	Place       string `json:"place"`
	ID          string `json:"id"`
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	Affiliation string `json:"affiliation"`
	Time        string `json:"time"` // Rounded and formatted as appropriate (s.xx, m:ss.xx, or h:mm:ss.xx)
}

// LifData represents parsed .lif file data.
type LifData struct {
	FileName     string       `json:"fileName"`
	EventName    string       `json:"eventName"`
	Wind         string       `json:"wind"` // Wind with unit "m/s" if provided
	Competitors  []Competitor `json:"competitors"`
	ModifiedTime int64        `json:"modifiedTime"`
}

// DisplayState holds the current display mode and settings
type DisplayState struct {
	Mode         string   `json:"mode"`         // 'lif', 'text', or 'screensaver'
	ActiveText   string   `json:"activeText"`   // Text to display
	ImageBase64  string   `json:"imageBase64"`  // Base64 encoded image for screensaver
	RotationMode string   `json:"rotationMode"` // 'scroll', 'page', or 'scrollAll'
	CurrentLIF   *LifData `json:"currentLIF"`   // Current single event LIF for full screen mode
}

// App holds the application state.
type App struct {
	ctx          context.Context
	mu           sync.Mutex
	monitoredDir string
	latestData   *LifData
	watcher      *fsnotify.Watcher
	displayState *DisplayState
}

// NewApp creates a new App instance.
func NewApp() *App {
	return &App{
		displayState: &DisplayState{
			Mode:         "lif",
			ActiveText:   "",
			ImageBase64:  "",
			RotationMode: "scroll",
		},
	}
}

// SetDisplayState updates the current display state (called from frontend)
func (a *App) SetDisplayState(mode string, text string, imageBase64 string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.displayState == nil {
		a.displayState = &DisplayState{}
	}
	a.displayState.Mode = mode
	a.displayState.ActiveText = text
	a.displayState.ImageBase64 = imageBase64
	log.Printf("Display state updated: mode=%s", mode)
}

// SetCurrentLIF updates the current LIF data for full screen display (called from frontend)
func (a *App) SetCurrentLIF(lifData *LifData) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.displayState == nil {
		a.displayState = &DisplayState{}
	}
	a.displayState.CurrentLIF = lifData
	if lifData != nil {
		log.Printf("Current LIF updated: %s", lifData.EventName)
	} else {
		log.Printf("Current LIF cleared")
	}
}

// SetRotationMode updates the rotation mode (called from frontend)
func (a *App) SetRotationMode(rotationMode string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.displayState == nil {
		a.displayState = &DisplayState{
			Mode:         "lif",
			ActiveText:   "",
			ImageBase64:  "",
			RotationMode: rotationMode,
		}
	} else {
		a.displayState.RotationMode = rotationMode
	}
	log.Printf("Rotation mode updated: %s", rotationMode)
}

// GetDisplayState returns the current display state
func (a *App) GetDisplayState() *DisplayState {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.displayState == nil {
		return &DisplayState{Mode: "lif", ActiveText: "", ImageBase64: "", RotationMode: "scroll"}
	}
	return a.displayState
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	log.Println("Wails app startup complete. Context set.")
	// Maximize window on startup.
	runtime.WindowMaximise(a.ctx)
}

func (a *App) ChooseDirectory() (string, error) {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Directory to Monitor",
	})
	if err != nil {
		log.Println("OpenDirectoryDialog error:", err)
		return "", err
	}
	if dir == "" {
		log.Println("No directory selected (user canceled)")
		return "", nil
	}
	log.Println("Directory selected:", dir)
	a.monitoredDir = dir
	go a.watchDirectory()
	return dir, nil
}

func (a *App) EnterFullScreen() {
	runtime.WindowFullscreen(a.ctx)
}

func (a *App) ExitFullScreen() {
	runtime.WindowUnfullscreen(a.ctx)
}

func (a *App) watchDirectory() {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Println("Error creating watcher:", err)
		return
	}
	a.watcher = watcher

	err = watcher.Add(a.monitoredDir)
	if err != nil {
		log.Println("Error adding directory to watcher:", err)
		return
	}
	log.Println("Monitoring directory:", a.monitoredDir)

	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			ext := strings.ToLower(filepath.Ext(event.Name))
			if (ext == ".lif" || ext == ".res" || ext == ".mf4") &&
				(event.Op&fsnotify.Write == fsnotify.Write || event.Op&fsnotify.Create == fsnotify.Create) {
				log.Println("Detected change in:", event.Name)
				time.Sleep(100 * time.Millisecond)
				data, err := parseFile(event.Name)
				if err != nil {
					log.Printf("Error parsing %s file: %v", ext, err)
					continue
				}
				a.mu.Lock()
				a.latestData = data
				a.mu.Unlock()
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Println("Watcher error:", err)
		}
	}
}

// GetAllLIFData scans the monitored directory for all .lif, .res, and .mf4 files,
// parses each file fresh, and returns a slice of pointers to LifData.
// It does not retain previous data.
func (a *App) GetAllLIFData() ([]*LifData, error) {
	if a.monitoredDir == "" {
		return nil, fmt.Errorf("no directory selected")
	}
	entries, err := os.ReadDir(a.monitoredDir)
	if err != nil {
		return nil, err
	}
	var results []*LifData
	for _, entry := range entries {
		if !entry.IsDir() {
			ext := strings.ToLower(filepath.Ext(entry.Name()))
			if ext == ".lif" || ext == ".res" || ext == ".mf4" {
				filePath := filepath.Join(a.monitoredDir, entry.Name())
				data, err := parseFile(filePath)
				if err != nil {
					log.Printf("Error parsing %s file %s: %v", ext, entry.Name(), err)
					continue
				}
				results = append(results, data)
			}
		}
	}
	return results, nil
}

// getDecoder now uses the chardet package to determine the file's encoding.
// The original file is only read (not modified) and its contents are converted to UTF‑8.
func getDecoder(file *os.File) (transform.Transformer, error) {
	const sampleSize = 512
	buf := make([]byte, sampleSize)
	n, err := file.Read(buf)
	if err != nil && err != io.EOF {
		return nil, err
	}
	if _, err := file.Seek(0, 0); err != nil {
		return nil, err
	}
	sample := buf[:n]

	// Use chardet to detect the encoding.
	detector := chardet.NewTextDetector()
	result, err := detector.DetectBest(sample)
	if err != nil {
		log.Printf("Error detecting charset, defaulting to no transformation: %v", err)
		return transform.Nop, nil
	}
	log.Printf("Detected charset: %s", result.Charset)

	// Return the appropriate decoder based on the detected charset.
	switch strings.ToLower(result.Charset) {
	case "utf-8":
		return transform.Nop, nil
	case "windows-1252":
		return charmap.Windows1252.NewDecoder(), nil
	case "iso-8859-1":
		return charmap.ISO8859_1.NewDecoder(), nil
	case "utf-16le":
		return unicode.UTF16(unicode.LittleEndian, unicode.IgnoreBOM).NewDecoder(), nil
	case "utf-16be":
		return unicode.UTF16(unicode.BigEndian, unicode.IgnoreBOM).NewDecoder(), nil
	default:
		log.Printf("Charset %s not explicitly handled, defaulting to no transformation", result.Charset)
		return transform.Nop, nil
	}
}

// parseTimeString converts a time string into total seconds.
// It supports formats with hours, minutes, and seconds:
//
//	h:mm:ss.xxx, mm:ss.xxx, or ss.xxx (with variable decimal precision).
func parseTimeString(raw string) (float64, error) {
	raw = strings.TrimSpace(raw)
	parts := strings.Split(raw, ":")
	var total float64
	if len(parts) == 3 {
		hours, err := strconv.ParseFloat(parts[0], 64)
		if err != nil {
			return 0, fmt.Errorf("invalid hours in time format: %s", raw)
		}
		minutes, err := strconv.ParseFloat(parts[1], 64)
		if err != nil {
			return 0, fmt.Errorf("invalid minutes in time format: %s", raw)
		}
		seconds, err := strconv.ParseFloat(parts[2], 64)
		if err != nil {
			return 0, fmt.Errorf("invalid seconds in time format: %s", raw)
		}
		total = hours*3600 + minutes*60 + seconds
	} else if len(parts) == 2 {
		minutes, err := strconv.ParseFloat(parts[0], 64)
		if err != nil {
			return 0, fmt.Errorf("invalid minutes in time format: %s", raw)
		}
		seconds, err := strconv.ParseFloat(parts[1], 64)
		if err != nil {
			return 0, fmt.Errorf("invalid seconds in time format: %s", raw)
		}
		total = minutes*60 + seconds
	} else if len(parts) == 1 {
		seconds, err := strconv.ParseFloat(parts[0], 64)
		if err != nil {
			return 0, fmt.Errorf("invalid seconds in time format: %s", raw)
		}
		total = seconds
	} else {
		return 0, fmt.Errorf("invalid time format: %s", raw)
	}
	return total, nil
}

// roundAndFormatTime rounds up the total seconds to the next hundredth
// and then formats the time based on its magnitude:
// - If hours > 0: h:mm:ss.xx
// - Else if minutes > 0: m:ss.xx
// - Otherwise: s.xx
func roundAndFormatTime(raw string) (string, error) {
	total, err := parseTimeString(raw)
	if err != nil {
		return "", err
	}
	rounded := math.Ceil(total*100) / 100
	hours := int(rounded) / 3600
	minutes := (int(rounded) % 3600) / 60
	seconds := int(rounded) % 60
	fraction := rounded - float64(int(rounded))
	hundredths := int(math.Round(fraction * 100))
	if hundredths == 100 {
		seconds++
		hundredths = 0
		if seconds >= 60 {
			minutes++
			seconds = 0
			if minutes >= 60 {
				hours++
				minutes = 0
			}
		}
	}
	if hours > 0 {
		return fmt.Sprintf("%d:%02d:%02d.%02d", hours, minutes, seconds, hundredths), nil
	} else if minutes > 0 {
		return fmt.Sprintf("%d:%02d.%02d", minutes, seconds, hundredths), nil
	} else {
		return fmt.Sprintf("%d.%02d", seconds, hundredths), nil
	}
}

func cleanTimeString(s string) string {
	return strings.Map(func(r rune) rune {
		if r < 32 || r == 0xFEFF {
			return -1
		}
		return r
	}, s)
}

func parseResFile(path string) (*LifData, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	decoder, err := getDecoder(file)
	if err != nil {
		return nil, err
	}
	utf8Reader := transform.NewReader(file, decoder)
	reader := csv.NewReader(utf8Reader)
	reader.Comma = '\t' // TAB delimiter for .res files
	reader.FieldsPerRecord = -1
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(records) < 3 {
		return nil, fmt.Errorf("insufficient records in file: %s (expected at least 3 lines)", path)
	}
	for i, row := range records {
		log.Printf("Row %d (fields: %d): %v", i, len(row), row)
	}

	// Line 0: Image information line (contains filename, wind, file size, lines per second, time and date)
	imageInfoRow := records[0]
	eventName := ""
	wind := ""

	// Extract event name from filename in first field if available
	if len(imageInfoRow) > 0 {
		filename := strings.TrimSpace(imageInfoRow[0])
		// Remove extension and use as event name
		eventName = strings.TrimSuffix(filename, filepath.Ext(filename))
	}

	// Extract wind information from the image info row (typically in second field)
	if len(imageInfoRow) > 1 {
		windVal := strings.TrimSpace(imageInfoRow[1])
		if windVal != "" {
			// Remove "Manual", "manual" and parentheses if present
			windVal = strings.ReplaceAll(windVal, "Manual", "")
			windVal = strings.ReplaceAll(windVal, "manual", "")
			windVal = strings.ReplaceAll(windVal, "(", "")
			windVal = strings.ReplaceAll(windVal, ")", "")
			windVal = strings.TrimSpace(windVal)
			if windVal != "" && windVal != "0" {
				// Add m/s unit if not already present
				if !strings.Contains(windVal, "m/s") {
					wind = windVal + " m/s"
				} else {
					wind = windVal
				}
			}
		}
	}

	// Line 1: Header row (skip it)
	// Line 2+: Competitor data
	// Fields: Place, Lane, Time, ID, Name (optional), Extra info (optional)

	var competitors []Competitor
	for i := 2; i < len(records); i++ {
		row := records[i]
		// .res files have at least 3 fields (place, lane, time) and up to 6 fields
		if len(row) < 3 {
			log.Printf("Row %d skipped: not enough fields (found %d, expected at least 3)", i, len(row))
			continue
		}

		place := strings.TrimSpace(row[0])

		// Skip DNS entries entirely - they should not be displayed
		if place == "" || strings.ToUpper(place) == "DNS" {
			log.Printf("Row %d skipped: DNS entry or empty place '%s'", i, place)
			continue
		}

		// Field 1 is lane (not used in the display)

		rawTime := ""
		if len(row) > 2 {
			rawTime = cleanTimeString(strings.TrimSpace(row[2]))
		}

		id := ""
		if len(row) > 3 {
			id = strings.TrimSpace(row[3])
		}

		name := ""
		if len(row) > 4 {
			name = strings.TrimSpace(row[4])
		}

		// Split name into first and last name if present
		firstName := ""
		lastName := ""
		if name != "" {
			// Try to split name (assume "FirstName LastName" format)
			nameParts := strings.Fields(name)
			if len(nameParts) >= 2 {
				firstName = nameParts[0]
				lastName = strings.Join(nameParts[1:], " ")
			} else if len(nameParts) == 1 {
				lastName = nameParts[0]
			}
		}

		affiliation := ""
		if len(row) > 5 {
			affiliation = strings.TrimSpace(row[5])
		}

		var formattedTime string
		upperPlace := strings.ToUpper(strings.TrimSpace(place))
		upperTime := strings.ToUpper(rawTime)

		// Handle DQ and DNF results - these are valid results that should be displayed
		if upperPlace == "DQ" || upperPlace == "DNF" || upperTime == "DQ" || upperTime == "DNF" {
			// For DQ/DNF, clear the place field and set time to DQ or DNF
			if upperPlace == "DQ" || upperTime == "DQ" {
				formattedTime = "DQ"
			} else {
				formattedTime = "DNF"
			}
			place = "" // Clear place for DQ/DNF entries
		} else if rawTime == "" {
			log.Printf("Row %d skipped: no time value", i)
			continue
		} else {
			formattedTime, err = roundAndFormatTime(rawTime)
			if err != nil {
				log.Printf("Row %d skipped: error processing time '%s': %v", i, rawTime, err)
				continue
			}
		}

		competitor := Competitor{
			Place:       place,
			ID:          id,
			FirstName:   firstName,
			LastName:    lastName,
			Affiliation: affiliation,
			Time:        formattedTime,
		}
		competitors = append(competitors, competitor)
	}

	if len(competitors) == 0 {
		return nil, fmt.Errorf("no valid competitor data found in file: %s", path)
	}

	// Split into timed and untimed (DQ/DNF)
	var timed, untimed []Competitor
	for _, c := range competitors {
		if c.Time == "DQ" || c.Time == "DNF" {
			untimed = append(untimed, c)
		} else {
			timed = append(timed, c)
		}
	}
	// Sort timed by actual parsed time ascending
	sort.Slice(timed, func(i, j int) bool {
		ti, _ := parseTimeString(timed[i].Time)
		tj, _ := parseTimeString(timed[j].Time)
		return ti < tj
	})
	// Combine: timed first, then untimed (DQ/DNF at the end)
	competitors = append(timed, untimed...)

	fileInfo, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("failed to get file info: %v", err)
	}
	data := &LifData{
		FileName:     filepath.Base(path),
		EventName:    eventName,
		Wind:         wind,
		Competitors:  competitors,
		ModifiedTime: fileInfo.ModTime().Unix(),
	}
	return data, nil
}

// parseFile determines the file type by extension and calls the appropriate parser
func parseFile(path string) (*LifData, error) {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".lif":
		return parseLifFile(path)
	case ".res", ".mf4":
		// Both .res and .mf4 use the same TAB-delimited format
		return parseResFile(path)
	default:
		return nil, fmt.Errorf("unsupported file type: %s", ext)
	}
}

func parseLifFile(path string) (*LifData, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	decoder, err := getDecoder(file)
	if err != nil {
		return nil, err
	}
	utf8Reader := transform.NewReader(file, decoder)
	reader := csv.NewReader(utf8Reader)
	reader.Comma = ','
	reader.FieldsPerRecord = -1
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(records) < 1 {
		return nil, fmt.Errorf("no records found in file: %s", path)
	}
	for i, row := range records {
		log.Printf("Row %d (fields: %d): %v", i, len(row), row)
	}
	eventRow := records[0]
	eventName := ""
	wind := ""
	if len(eventRow) >= 4 {
		// Preserve the original spacing in the event name.
		eventName = eventRow[3]
	}
	if len(eventRow) >= 5 {
		windVal := strings.TrimSpace(eventRow[4])
		if windVal != "" {
			// Remove "Manual", "manual" and parentheses.
			windVal = strings.ReplaceAll(windVal, "Manual", "")
			windVal = strings.ReplaceAll(windVal, "manual", "")
			windVal = strings.ReplaceAll(windVal, "(", "")
			windVal = strings.ReplaceAll(windVal, ")", "")
			windVal = strings.TrimSpace(windVal)
			if windVal != "" {
				wind = windVal + " m/s"
			}
		}
	}
	var competitors []Competitor
	for i := 1; i < len(records); i++ {
		row := records[i]
		// All LIF files are expected to have 7 fields in the competitor row.
		if len(row) < 7 {
			log.Printf("Row %d skipped: not enough fields (found %d)", i, len(row))
			continue
		}
		place := strings.TrimSpace(row[0])

		// Skip DNS entries entirely - they should not be displayed
		if place == "" || strings.ToUpper(place) == "DNS" {
			log.Printf("Row %d skipped: DNS entry or empty place '%s'", i, place)
			continue
		}

		rawTime := cleanTimeString(strings.TrimSpace(row[6]))
		var formattedTime string
		upperPlace := strings.ToUpper(strings.TrimSpace(place))
		upperTime := strings.ToUpper(rawTime)

		// Handle DQ and DNF results - these are valid results that should be displayed
		if upperPlace == "DQ" || upperPlace == "DNF" || upperTime == "DQ" || upperTime == "DNF" {
			// For DQ/DNF, clear the place field and set time to DQ or DNF
			if upperPlace == "DQ" || upperTime == "DQ" {
				formattedTime = "DQ"
			} else {
				formattedTime = "DNF"
			}
			place = "" // Clear place for DQ/DNF entries
		} else {
			formattedTime, err = roundAndFormatTime(rawTime)
			if err != nil {
				log.Printf("Row %d skipped: error processing time '%s': %v", i, rawTime, err)
				continue
			}
		}

		competitor := Competitor{
			Place:       place,
			ID:          strings.TrimSpace(row[1]),
			FirstName:   strings.TrimSpace(row[4]),
			LastName:    strings.TrimSpace(row[3]),
			Affiliation: strings.TrimSpace(row[5]),
			Time:        formattedTime,
		}
		competitors = append(competitors, competitor)
	}
	if len(competitors) == 0 {
		return nil, fmt.Errorf("no valid competitor data found in file: %s", path)
	}

	// Split into timed and untimed (DQ/DNF)
	var timed, untimed []Competitor
	for _, c := range competitors {
		if c.Time == "DQ" || c.Time == "DNF" {
			untimed = append(untimed, c)
		} else {
			timed = append(timed, c)
		}
	}
	// Sort timed by actual parsed time ascending
	sort.Slice(timed, func(i, j int) bool {
		ti, _ := parseTimeString(timed[i].Time)
		tj, _ := parseTimeString(timed[j].Time)
		return ti < tj
	})
	// Combine: timed first, then untimed (DQ/DNF at the end)
	competitors = append(timed, untimed...)

	fileInfo, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("failed to get file info: %v", err)
	}
	data := &LifData{
		FileName:     filepath.Base(path),
		EventName:    eventName,
		Wind:         wind,
		Competitors:  competitors,
		ModifiedTime: fileInfo.ModTime().Unix(),
	}
	return data, nil
}

func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "unknown"
	}
	for _, address := range addrs {
		if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "unknown"
}

// GetWebInterfaceInfo returns a string with URLs to access the web interface.
func (a *App) GetWebInterfaceInfo() string {
	hostIP := getLocalIP()
	return fmt.Sprintf("Access the web interface at: http://localhost:3000 or http://%s:3000", hostIP)
}

func StartFiberServer(app *App) {
	fiberApp := fiber.New()
	fiberApp.Use(cors.New(cors.Config{
		AllowOrigins:     "*",
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		ExposeHeaders:    "Content-Length",
		AllowCredentials: false,
	}))
	// API endpoint to get the latest LIF data.
	fiberApp.Get("/latest-lif", func(c *fiber.Ctx) error {
		app.mu.Lock()
		data := app.latestData
		app.mu.Unlock()
		if data == nil {
			return c.JSON(map[string]interface{}{})
		}
		return c.JSON(data)
	})
	// API endpoint to get all LIF data.
	fiberApp.Get("/all-lif", func(c *fiber.Ctx) error {
		data, err := app.GetAllLIFData()
		if err != nil {
			return c.Status(500).JSON(map[string]interface{}{"error": err.Error()})
		}
		return c.JSON(data)
	})
	// API endpoint to get current display state.
	fiberApp.Get("/display-state", func(c *fiber.Ctx) error {
		state := app.GetDisplayState()
		log.Printf("GET /display-state: mode=%s, activeText=%s (len=%d), rotationMode=%s",
			state.Mode, state.ActiveText, len(state.ActiveText), state.RotationMode)
		return c.JSON(state)
	})
	// API endpoint to set display state (for desktop app to sync with server).
	fiberApp.Post("/display-state", func(c *fiber.Ctx) error {
		var state DisplayState
		if err := c.BodyParser(&state); err != nil {
			return c.Status(400).JSON(map[string]interface{}{"error": err.Error()})
		}
		lifEvent := "none"
		if state.CurrentLIF != nil {
			lifEvent = state.CurrentLIF.EventName
		}
		log.Printf("POST /display-state: mode=%s, activeText=%s (len=%d), rotationMode=%s, currentLIF=%s",
			state.Mode, state.ActiveText, len(state.ActiveText), state.RotationMode, lifEvent)
		app.SetDisplayState(state.Mode, state.ActiveText, state.ImageBase64)
		// Also update rotation mode if provided
		if state.RotationMode != "" {
			app.SetRotationMode(state.RotationMode)
		}
		// Update current LIF for full screen display
		app.SetCurrentLIF(state.CurrentLIF)
		return c.JSON(map[string]interface{}{"success": true})
	})
	// Serve static files from embedded assets using the filesystem middleware.
	dist, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}
	// Add cache control headers to prevent browser caching issues
	fiberApp.Use("/", func(c *fiber.Ctx) error {
		// For HTML files, disable caching to ensure latest version is always loaded
		if c.Path() == "/" || c.Path() == "/index.html" {
			c.Set("Cache-Control", "no-cache, no-store, must-revalidate")
			c.Set("Pragma", "no-cache")
			c.Set("Expires", "0")
		}
		return c.Next()
	})
	fiberApp.Use("/", filesystem.New(filesystem.Config{
		Root:  http.FS(dist),
		Index: "index.html",
	}))
	// Listen on all interfaces (0.0.0.0) to allow LAN access
	if err := fiberApp.Listen("0.0.0.0:3000"); err != nil {
		log.Fatal(err)
	}
}

func main() {
	app := NewApp()
	go StartFiberServer(app)
	err := wails.Run(&options.App{
		Title:            "KACPH LIF Display",
		Width:            800,
		Height:           600,
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 255},
		Assets:           assets,
		OnStartup:        app.startup,
		Bind:             []interface{}{app},
	})
	if err != nil {
		log.Fatal(err)
	}
}
