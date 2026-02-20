package main

import (
	"context"
	"embed"
	"encoding/base64"
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
	"github.com/hashicorp/mdns"
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
	LayoutTheme  string   `json:"layoutTheme"`  // 'classic', 'modernDark', 'light', or 'highContrast'
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
			LayoutTheme:  "classic",
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

// SetLayoutTheme updates the layout theme (called from frontend)
func (a *App) SetLayoutTheme(layoutTheme string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.displayState == nil {
		a.displayState = &DisplayState{
			Mode:         "lif",
			ActiveText:   "",
			ImageBase64:  "",
			RotationMode: "scroll",
			LayoutTheme:  layoutTheme,
		}
	} else {
		a.displayState.LayoutTheme = layoutTheme
	}
	log.Printf("Layout theme updated: %s", layoutTheme)
}

// GetDisplayState returns the current display state
func (a *App) GetDisplayState() *DisplayState {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.displayState == nil {
		return &DisplayState{Mode: "lif", ActiveText: "", ImageBase64: "", RotationMode: "scroll", LayoutTheme: "classic"}
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

// SaveGraphic saves a base64-encoded PNG image to the monitored directory.
// The filename is PolyField-Track_DDMMYY_<units>.png
func (a *App) SaveGraphic(base64Data string, units string) (string, error) {
	if a.monitoredDir == "" {
		return "", fmt.Errorf("no directory selected")
	}

	// Strip the data URL prefix if present
	if idx := strings.Index(base64Data, ","); idx != -1 {
		base64Data = base64Data[idx+1:]
	}

	// Decode base64
	imgBytes, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return "", fmt.Errorf("failed to decode image data: %v", err)
	}

	// Generate filename: PolyField-Track_DDMMYY_Units.png
	now := time.Now()
	dateStr := now.Format("020106") // DDMMYY
	filename := fmt.Sprintf("PolyField-Track_%s_%s.png", dateStr, units)
	fullPath := filepath.Join(a.monitoredDir, filename)

	if err := os.WriteFile(fullPath, imgBytes, 0644); err != nil {
		return "", fmt.Errorf("failed to save graphic: %v", err)
	}

	log.Printf("Graphic saved: %s", fullPath)
	return fullPath, nil
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
			if (ext == ".lif" || ext == ".res" || ext == ".txt") &&
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

// GetAllLIFData scans the monitored directory for all .lif, .res, and .txt files,
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
			if ext == ".lif" || ext == ".res" || ext == ".txt" {
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
	// Remove duplicates based on competitor data
	// If two files have identical competitors (same athletes and performances), keep only the newer one
	deduplicated := make([]*LifData, 0, len(results))
	seen := make(map[string]*LifData)

	for _, result := range results {
		// Create a hash of competitor data (names and times)
		hash := ""
		for _, comp := range result.Competitors {
			hash += comp.FirstName + "|" + comp.LastName + "|" + comp.Time + ";"
		}

		// If we've seen this exact competitor data before, keep the newer file
		if existing, exists := seen[hash]; exists {
			if result.ModifiedTime > existing.ModifiedTime {
				seen[hash] = result
			}
		} else {
			seen[hash] = result
		}
	}

	// Collect deduplicated results
	for _, result := range seen {
		deduplicated = append(deduplicated, result)
	}

	// Sort results by ModifiedTime (oldest to newest)
	// This ensures consistent ordering across all platforms
	sort.Slice(deduplicated, func(i, j int) bool {
		return deduplicated[i].ModifiedTime < deduplicated[j].ModifiedTime
	})
	return deduplicated, nil
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
	// Check if this is a .txt file for special cleaning
	isTxtFile := strings.ToLower(filepath.Ext(path)) == ".txt"

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

	// Extract event name from filename in first field if available (fallback)
	if len(imageInfoRow) > 0 {
		filename := strings.TrimSpace(imageInfoRow[0])
		// Remove extension and use as event name
		eventName = strings.TrimSuffix(filename, filepath.Ext(filename))
	}

	// Look for a line with "# Event:" to override the event name
	for _, row := range records {
		if len(row) > 0 {
			firstField := strings.TrimSpace(row[0])
			if strings.HasPrefix(firstField, "# Event:") {
				// Extract text after "# Event:"
				eventName = strings.TrimSpace(strings.TrimPrefix(firstField, "# Event:"))
				break
			}
		}
	}

	// Extract wind information from the image info row (typically in second field)
	if len(imageInfoRow) > 1 {
		windVal := strings.TrimSpace(imageInfoRow[1])
		if windVal != "" {
			// For .txt files, remove "N/A" or "N/A m/s" values
			if isTxtFile && (strings.ToUpper(windVal) == "N/A" || strings.ToUpper(windVal) == "N/A M/S") {
				wind = ""
			} else {
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
			// For .txt files, remove anything in brackets (including brackets)
			if isTxtFile {
				// Remove everything from first '(' to matching ')'
				for {
					openIdx := strings.Index(id, "(")
					if openIdx == -1 {
						break
					}
					closeIdx := strings.Index(id[openIdx:], ")")
					if closeIdx == -1 {
						// No matching close bracket, remove from '(' to end
						id = strings.TrimSpace(id[:openIdx])
						break
					}
					// Remove the bracketed content
					id = strings.TrimSpace(id[:openIdx] + id[openIdx+closeIdx+1:])
				}
			}
		}

		name := ""
		if len(row) > 4 {
			name = strings.TrimSpace(row[4])
			// For .txt files, the name should already be clean in field 4
			// Any numbers are in field 5 (Information), so no cleaning needed
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
			// For .txt files, field 5 is "Information" (numbers only), not affiliation
			// We don't want to display this, so clear it
			if isTxtFile {
				affiliation = ""
			}
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
	case ".res", ".txt":
		// Both .res and .txt use the same TAB-delimited format
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

// getLANIPs returns the non-loopback IPv4 addresses of this machine.
func getLANIPs() []net.IP {
	var ips []net.IP
	ifaces, err := net.Interfaces()
	if err != nil {
		return ips
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			if ipnet, ok := addr.(*net.IPNet); ok {
				if ip4 := ipnet.IP.To4(); ip4 != nil {
					ips = append(ips, ip4)
				}
			}
		}
	}
	return ips
}

// startMDNS registers "track.local" via mDNS so LAN devices can reach the server.
func startMDNS() {
	ips := getLANIPs()
	if len(ips) == 0 {
		log.Println("mDNS: no LAN IP addresses found, skipping registration")
		return
	}
	service, err := mdns.NewMDNSService(
		"PolyField Track", // instance name
		"_http._tcp",      // service type
		"",                // domain (default "local.")
		"track.local.",    // custom hostname
		3000,              // port
		ips,               // IP addresses
		[]string{"path=/"},
	)
	if err != nil {
		log.Printf("mDNS: failed to create service: %v", err)
		return
	}
	_, err = mdns.NewServer(&mdns.Config{Zone: service})
	if err != nil {
		log.Printf("mDNS: failed to start server: %v", err)
		return
	}
	log.Printf("mDNS: registered track.local -> %v", ips)
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
	// API endpoint to get display state.
	fiberApp.Get("/display-state", func(c *fiber.Ctx) error {
		state := app.GetDisplayState()
		return c.JSON(state)
	})
	// API endpoint to set display state.
	fiberApp.Post("/display-state", func(c *fiber.Ctx) error {
		var state DisplayState
		if err := c.BodyParser(&state); err != nil {
			return c.Status(400).JSON(map[string]interface{}{"error": err.Error()})
		}
		app.SetDisplayState(state.Mode, state.ActiveText, state.ImageBase64)
		if state.RotationMode != "" {
			app.SetRotationMode(state.RotationMode)
		}
		if state.LayoutTheme != "" {
			app.SetLayoutTheme(state.LayoutTheme)
		}
		app.SetCurrentLIF(state.CurrentLIF)
		return c.JSON(map[string]interface{}{"success": true})
	})
	// Serve static files from embedded assets using the filesystem middleware.
	dist, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}
	// Serve static files from embedded assets
	fiberApp.Use("/", filesystem.New(filesystem.Config{
		Root:  http.FS(dist),
		Index: "index.html",
	}))
	// SPA fallback: serve index.html for client-side routes (e.g. /athlete, /results)
	indexHTML, err := fs.ReadFile(assets, "frontend/dist/index.html")
	if err != nil {
		log.Fatal(err)
	}
	fiberApp.Get("/*", func(c *fiber.Ctx) error {
		c.Set("Content-Type", "text/html")
		return c.Send(indexHTML)
	})
	// Listen on all interfaces (0.0.0.0) to allow LAN access
	if err := fiberApp.Listen("0.0.0.0:3000"); err != nil {
		log.Fatal(err)
	}
}

func main() {
	app := NewApp()
	go StartFiberServer(app)
	go startMDNS()
	err := wails.Run(&options.App{
		Title:            "PolyField - Track",
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
