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
	FileName    string       `json:"fileName"`
	EventName   string       `json:"eventName"`
	Wind        string       `json:"wind"` // Wind with unit "m/s" if provided
	Competitors []Competitor `json:"competitors"`
}

// App holds the application state.
type App struct {
	ctx          context.Context
	mu           sync.Mutex
	monitoredDir string
	latestData   *LifData
	watcher      *fsnotify.Watcher
}

// NewApp creates a new App instance.
func NewApp() *App {
	return &App{}
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
			if filepath.Ext(event.Name) == ".lif" &&
				(event.Op&fsnotify.Write == fsnotify.Write || event.Op&fsnotify.Create == fsnotify.Create) {
				log.Println("Detected change in:", event.Name)
				time.Sleep(100 * time.Millisecond)
				data, err := parseLifFile(event.Name)
				if err != nil {
					log.Println("Error parsing .lif file:", err)
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

// GetAllLIFData scans the monitored directory for all .lif files,
// parses each file fresh, and returns a slice of pointers to LifData.
// It does not retain previous LIF data.
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
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".lif" {
			filePath := filepath.Join(a.monitoredDir, entry.Name())
			data, err := parseLifFile(filePath)
			if err != nil {
				log.Printf("Error parsing LIF file %s: %v", entry.Name(), err)
				continue
			}
			results = append(results, data)
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
		if place == "" || place == "DNS" {
			log.Printf("Row %d skipped: invalid place '%s'", i, place)
			continue
		}
		rawTime := cleanTimeString(strings.TrimSpace(row[6]))
		var formattedTime string
		upperPlace := strings.ToUpper(strings.TrimSpace(place))
		upperTime := strings.ToUpper(rawTime)

		if upperPlace == "DQ" || upperPlace == "DNF" || upperTime == "DQ" || upperTime == "DNF" {
			formattedTime = upperPlace
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

	// Split into timed and untimed
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
	// Combine: timed first, then untimed
	competitors = append(timed, untimed...)
	data := &LifData{
		FileName:    filepath.Base(path),
		EventName:   eventName,
		Wind:        wind,
		Competitors: competitors,
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
	// Serve static files from embedded assets using the filesystem middleware.
	dist, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}
	fiberApp.Use("/", filesystem.New(filesystem.Config{
		Root:  http.FS(dist),
		Index: "index.html",
	}))
	if err := fiberApp.Listen("127.0.0.1:3000"); err != nil {
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
