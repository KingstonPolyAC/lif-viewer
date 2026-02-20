import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChooseDirectory, EnterFullScreen, ExitFullScreen, GetWebInterfaceInfo, SaveGraphic } from "../wailsjs/go/main/App";
import { THEMES, getColumnWidths, shortenClub } from './themes';
import polyfieldLogo from './polyfield-logo.png';
import SocialGraphic from './SocialGraphic';

// Fixed dimensions for the default table container.
const DEFAULT_TABLE_HEIGHT = 192; // in pixels
const DEFAULT_TABLE_WIDTH = 384;  // in pixels

// Main container with navy themed background.
const containerStyle = {
  width: '100vw',
  height: '100vh',
  position: 'relative',
  background: 'linear-gradient(160deg, #001a33 0%, #003366 40%, #002244 100%)',
  overflow: 'hidden',
};

// Table container styles.
const defaultTableContainerStyle = {
  width: `${DEFAULT_TABLE_WIDTH}px`,
  height: `${DEFAULT_TABLE_HEIGHT}px`,
  backgroundColor: '#000',
  position: 'absolute',
  top: '2px',
  left: '2px',
  zIndex: 2,
  overflow: 'hidden',
};

const expandedTableContainerStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  backgroundColor: '#000',
  zIndex: 5,
  overflow: 'hidden',
};

// Control Panel container - right half of screen.
const controlPanelStyle = {
  position: 'absolute',
  top: '0',
  right: '0',
  width: '50%',
  height: '100vh',
  zIndex: 3,
  display: 'flex',
  flexDirection: 'column',
  borderRadius: '0',
  border: 'none',
  backgroundColor: '#0d1b2a',
  color: '#e0e0e0',
};

// Table cell style: fixed layout, no wrapping, clipped overflow, vertically centred.
const tableCellStyle = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'clip',
  padding: '0px',
  margin: '0px',
  verticalAlign: 'middle',
};

// Style for the screensaver image to ensure it fits while maintaining its aspect ratio.
const screensaverImageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  position: 'absolute',
  top: 0,
  left: 0,
};

function App() {
  // === INLINE COMPONENTS ===
  const SegmentedControl = ({ options, selected, onChange }) => (
    <div style={{ border: '1px solid #2a4a6b', borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
      {options.map((opt, i) => (
        <div
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '6px 6px',
            fontSize: '0.8rem',
            cursor: 'pointer',
            backgroundColor: selected === opt.value ? '#2e7d32' : 'transparent',
            color: selected === opt.value ? '#fff' : '#a0b4c8',
            fontWeight: selected === opt.value ? 'bold' : 'normal',
            ...(i > 0 ? { borderLeft: '1px solid #2a4a6b' } : {}),
          }}
        >
          {opt.label}
        </div>
      ))}
    </div>
  );

  // === CORE STATE ===
  const [currentLifData, setCurrentLifData] = useState(null);
  const [lifDataHistory, setLifDataHistory] = useState([]);
  const lastModifiedTimeRef = useRef(0); // Use ref instead of state to prevent re-renders
  const [error, setError] = useState('');
  const [selectedDir, setSelectedDir] = useState('');
  const [webInterfaceInfo, setWebInterfaceInfo] = useState("");
  
  // === DISPLAY STATE ===
  const [displayMode, setDisplayMode] = useState('lif'); // 'lif', 'text', 'screensaver'
  const [activeText, setActiveText] = useState('');
  const [inputText, setInputText] = useState('');
  const [linkedImage, setLinkedImage] = useState(null);
  
  // === UI STATE ===
  const [textMultiplier, setTextMultiplier] = useState(60);
  const [expandedTable, setExpandedTable] = useState(false);
  const [appFullScreen, setAppFullScreen] = useState(false);
  const [rotationIndex, setRotationIndex] = useState(0);
  const [rotationMode, setRotationMode] = useState('scroll'); // 'scroll', 'page', or 'scrollAll'
  const [layoutTheme, setLayoutTheme] = useState('classic');
  
  // === ALL-LIF DATA & SOCIAL GRAPHIC STATE ===
  const [allLifData, setAllLifData] = useState([]);
  const [showSocialGraphic, setShowSocialGraphic] = useState(false);

  // === CUSTOM CLUB ACRONYMS & BIB TOGGLE ===
  const [customAcronyms, setCustomAcronyms] = useState(null);
  const [showBib, setShowBib] = useState(true);

  // === UI COLLAPSE STATE ===
  const [showWebViews, setShowWebViews] = useState(false);
  const [showTextSize, setShowTextSize] = useState(false);
  const [showRotation, setShowRotation] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showBibs, setShowBibs] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // === DEBUG STATE ===
  const [debugLog, setDebugLog] = useState([]);
  
  const navigate = useNavigate();

  // === UTILITY FUNCTIONS ===
  const addDebugLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLog(prev => {
      const newLog = [`${timestamp}: ${message}`, ...prev];
      return newLog.slice(0, 10); // Keep only last 10 messages
    });
  };

  const incrementTextMultiplier = () => setTextMultiplier(prev => Math.min(prev + 5, 200));
  const decrementTextMultiplier = () => setTextMultiplier(prev => Math.max(prev - 5, 5));

  // === LIF DATA MANAGEMENT ===
  const saveCurrentLifToHistory = () => {
    if (currentLifData && currentLifData.competitors && currentLifData.competitors.length > 0) {
      setLifDataHistory(prev => {
        // Check if already in history to avoid duplicates by comparing modification times
        const alreadyExists = prev.some(item => item.modifiedTime === currentLifData.modifiedTime);
        if (!alreadyExists) {
          addDebugLog(`Saved to history: ${currentLifData.eventName || 'Unknown'}`);
          return [currentLifData, ...prev].slice(0, 5); // Keep only last 5
        }
        return prev;
      });
    }
  };

  const handleNewLifData = (newData) => {
    const newModTime = newData.modifiedTime || 0;
    const currentModTime = lastModifiedTimeRef.current;

    // Only process if file was actually modified OR this is the very first load
    if (newModTime !== currentModTime && newModTime > 0) {
      // Save current to history BEFORE updating (only if we have valid current data)
      if (currentLifData && currentLifData.competitors && currentLifData.competitors.length > 0 && currentModTime > 0) {
        saveCurrentLifToHistory();
      }

      // Set new data and update modification time reference
      setCurrentLifData(newData);
      lastModifiedTimeRef.current = newModTime;

      // ALWAYS switch to 'lif' mode when a new or changed file is detected
      // This ensures file changes take priority over text/screensaver displays
      setDisplayMode('lif');
      setActiveText(''); // Clear any active text
      syncDisplayState('lif', '', '', null, newData); // Sync to server for LAN viewers including the new LIF data

      if (currentModTime === 0) {
        // This is the initial load
        addDebugLog(`Initial LIF loaded: ${newData.eventName || 'Unknown'} - displaying results`);
        // Save initial data to history so Last LIF button works
        setLifDataHistory(prev => [newData, ...prev].slice(0, 5));
      } else {
        // This is an update to existing data
        addDebugLog(`LIF file updated: ${newData.eventName || 'Unknown'} - takes priority over text/screensaver`);
      }
    }
  };

  // === DATA FETCHING ===
  const fetchLatestData = async () => {
    try {
      // Desktop app: use local server. Web browser: use relative URLs
      const hostname = window.location.hostname;
      const isDesktop = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';
      const baseUrl = isDesktop ? 'http://127.0.0.1:3000' : '';
      const fullUrl = `${baseUrl}/latest-lif`;
      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setError('');

      if (Object.keys(data).length > 0 && data.modifiedTime) {
        const newModTime = data.modifiedTime;
        const currentModTime = lastModifiedTimeRef.current;

        if (newModTime !== currentModTime) {
          const modDate = new Date(newModTime * 1000);
          addDebugLog(`File modified: ${modDate.toLocaleTimeString()}`);
          handleNewLifData(data);
        } else {
          // Only log this occasionally to avoid spam
          if (debugLog.length === 0 || !debugLog[0].includes('No file changes')) {
            addDebugLog(`No file changes - polling continues (${new Date(newModTime * 1000).toLocaleTimeString()})`);
          }
        }
      } else {
        addDebugLog(`Fetch returned empty data or missing timestamp`);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      addDebugLog(`Fetch error: ${err.message}`);
      setError('Error fetching latest data.');
    }
  };

  const fetchAllLifData = async () => {
    try {
      const hostname = window.location.hostname;
      const isDesktop = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';
      const baseUrl = isDesktop ? 'http://127.0.0.1:3000' : '';
      const response = await fetch(`${baseUrl}/all-lif`);
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data)) {
        setAllLifData(data);
      }
    } catch (err) {
      // Silently fail - stats are non-critical
    }
  };

  // === DISPLAY STATE SYNC ===
  const syncDisplayState = async (mode, text, imageBase64, rotation = null, lifData = null) => {
    try {
      const hostname = window.location.hostname;
      const isDesktop = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';
      const baseUrl = isDesktop ? 'http://127.0.0.1:3000' : '';
      const payload = {
        mode: mode,
        activeText: text || '',
        imageBase64: imageBase64 || ''
      };
      // Include rotation mode if provided, or use current rotation mode
      if (rotation !== null) {
        payload.rotationMode = rotation;
      } else {
        payload.rotationMode = rotationMode;
      }
      // Include current LIF if provided, or use current LIF data
      if (lifData !== null) {
        payload.currentLIF = lifData;
      } else if (currentLifData) {
        payload.currentLIF = currentLifData;
      }
      // Include layout theme and bib toggle
      payload.layoutTheme = layoutTheme;
      payload.showBib = showBib;
      console.log('[Desktop] Syncing display state:', {
        mode: payload.mode,
        activeText: payload.activeText,
        activeTextLength: payload.activeText.length,
        rotationMode: payload.rotationMode,
        currentLIF: payload.currentLIF?.eventName || 'none'
      });
      await fetch(`${baseUrl}/display-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Error syncing display state:', error);
    }
  };

  // === DISPLAY MODE HANDLERS ===
  const showTextDisplay = () => {
    setActiveText(inputText);
    setDisplayMode('text');
    syncDisplayState('text', inputText, '');
    addDebugLog(`Text display: "${inputText.substring(0, 30)}..."`);
  };

  const clearTextDisplay = () => {
    setActiveText('');
    setDisplayMode('lif');
    syncDisplayState('lif', '', '');
    addDebugLog('Text cleared - showing LIF');
  };

  const showScreensaver = async () => {
    if (!linkedImage) {
      alert('Please link a PNG image first.');
      return;
    }
    // Convert image to base64
    try {
      const response = await fetch(linkedImage);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        setDisplayMode('screensaver');
        syncDisplayState('screensaver', '', base64);
        addDebugLog('Screensaver activated');
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Error converting image:', error);
      setDisplayMode('screensaver');
      addDebugLog('Screensaver activated (without sync)');
    }
  };

  const restoreLastLIF = () => {
    if (lifDataHistory.length > 0) {
      const lastLIF = lifDataHistory[0];
      setCurrentLifData(lastLIF);
      lastModifiedTimeRef.current = lastLIF.modifiedTime || 0;
      setDisplayMode('lif');
      setActiveText('');
      syncDisplayState('lif', '', ''); // Sync to server for LAN viewers
      setLifDataHistory(prev => prev.slice(1)); // Remove restored item
      addDebugLog(`Restored: ${lastLIF.eventName || 'Unknown'}`);
    } else {
      addDebugLog('No previous LIF data available');
    }
  };

  // === COMPUTED VALUES ===
  const displayedCompetitors = useMemo(() => {
    const comps = (currentLifData && currentLifData.competitors) || [];

    if (comps.length <= 8) {
      // If 8 or fewer competitors, just display them all
      const result = comps.slice(0, 8);
      while (result.length < 8) {
        result.push({ place: "", id: "", firstName: "", lastName: "", affiliation: "", time: "" });
      }
      return result;
    }

    // More than 8 competitors - use rotation mode
    if (rotationMode === 'scroll') {
      // Scroll mode: top 3 locked, remaining 5 scroll
      const fixed = comps.slice(0, 3);
      const rotating = comps.slice(3);
      const windowSize = 5;
      let rollingDisplayed = rotating.slice(rotationIndex, rotationIndex + windowSize);
      if (rollingDisplayed.length < windowSize) {
        rollingDisplayed = rollingDisplayed.concat(rotating.slice(0, windowSize - rollingDisplayed.length));
      }
      return fixed.concat(rollingDisplayed);
    } else if (rotationMode === 'page') {
      // Page mode: display 8 per page (1-8, 9-16, etc.)
      const pageSize = 8;
      const startIndex = rotationIndex * pageSize;
      const result = comps.slice(startIndex, startIndex + pageSize);
      // Fill remaining slots if on last page
      while (result.length < pageSize) {
        result.push({ place: "", id: "", firstName: "", lastName: "", affiliation: "", time: "" });
      }
      return result;
    } else if (rotationMode === 'scrollAll') {
      // Scroll All mode: all 8 positions scroll through all competitors
      const windowSize = 8;
      let result = comps.slice(rotationIndex, rotationIndex + windowSize);
      if (result.length < windowSize) {
        result = result.concat(comps.slice(0, windowSize - result.length));
      }
      return result;
    }

    return [];
  }, [currentLifData, rotationIndex, rotationMode]);

  // Track window size.
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : DEFAULT_TABLE_WIDTH,
    height: typeof window !== 'undefined' ? window.innerHeight : DEFAULT_TABLE_HEIGHT,
  });

  // Compute font size and row style.
  const { tableFontSize, rowStyle } = useMemo(() => {
    const defaultW = DEFAULT_TABLE_WIDTH;
    const defaultH = DEFAULT_TABLE_HEIGHT;
    const winWidth = windowSize.width || defaultW;
    const winHeight = windowSize.height || defaultH;
    const containerWidth = expandedTable ? winWidth : defaultW;
    const containerHeight = expandedTable ? winHeight : defaultH;
    
    const numRows = 9;
    const finalFontSize = (containerHeight / numRows) * (textMultiplier / 100);
    const rowHeight = containerHeight / numRows;
    const rowStyleObj = {
      height: rowHeight,
      lineHeight: rowHeight + 'px',
      overflow: 'hidden'
    };
    return { tableFontSize: finalFontSize, rowStyle: rowStyleObj };
  }, [expandedTable, windowSize, textMultiplier]);

  // Compute relative column widths as percentages, respecting theme column order.
  // Also tracks active columns (bib may be dropped if space is tight).
  const { colPercentages, activeColumns } = useMemo(() => {
    const theme = THEMES[layoutTheme] || THEMES.classic;
    const compsForWidth = displayedCompetitors.map(c => ({
      ...c,
      affiliation: shortenClub(c.affiliation, customAcronyms),
    }));
    const { widths, totalCh, columns } = getColumnWidths(compsForWidth, theme.columns);
    // Filter out bib column if showBib is false
    const filteredColumns = showBib ? columns : columns.filter(c => c !== 'bib');
    const filteredWidths = showBib ? widths : columns.reduce((acc, col, i) => {
      if (col !== 'bib') acc.push(widths[i]);
      return acc;
    }, []);
    const filteredTotal = filteredWidths.reduce((a, b) => a + b, 0);
    return {
      colPercentages: filteredWidths.map(w => (w / filteredTotal) * 100 + '%'),
      activeColumns: filteredColumns,
    };
  }, [displayedCompetitors, layoutTheme, customAcronyms, showBib]);

  // Compute style for header event name cell — spans all columns except the last (wind).
  const headerColSpan = activeColumns.length - 1;
  const headerEventNameStyle = useMemo(() => ({
    ...tableCellStyle,
    textAlign: 'left',
    maxWidth: `calc(${colPercentages.slice(0, headerColSpan).join(' + ')})`
  }), [colPercentages, headerColSpan]);

  // === COMPETITION STATS ===
  const competitionStats = useMemo(() => {
    if (!allLifData || allLifData.length === 0) {
      return { totalDistance: '\u2014', totalAthletes: '\u2014', totalTime: '\u2014', avgWind: '\u2014' };
    }

    // Parse distance in metres from event name
    const parseDistance = (eventName) => {
      if (!eventName) return 0;
      const name = eventName.toUpperCase();
      // Mile event
      if (/\bMILE\b/.test(name)) return 1609;
      // Relay: 4x100m, 4x300m, 4x400m etc.
      const relayMatch = name.match(/(\d+)\s*[xX]\s*(\d+)/);
      if (relayMatch) return parseInt(relayMatch[1], 10) * parseInt(relayMatch[2], 10);
      // Handle numbers with commas (e.g. 10,000m)
      const commaMatch = name.match(/\b(\d{1,3}(?:,\d{3})+)\s*(?:M(?:H)?|H)?\b/);
      if (commaMatch) return parseInt(commaMatch[1].replace(/,/g, ''), 10);
      // Match patterns like "100M", "1500M", "100 ", "400H", "60MH", "3000M SC" etc.
      const match = name.match(/\b(\d+)\s*(?:M(?:H)?|H)\b/);
      if (match) return parseInt(match[1], 10);
      // Try bare number at start or after age-group prefix (e.g. "U17G 60mh")
      const bareMatch = name.match(/\b(\d+)\b/);
      if (bareMatch) {
        const val = parseInt(bareMatch[1], 10);
        // Exclude unlikely distances (age groups like 17, 15, 13 etc.)
        // Valid track distances: 50, 60, 75, 80, 100, 110, 150, 200, 300, 400, 600, 800, 1000, 1500, 2000, 3000, 5000, 10000
        if (val >= 50) return val;
      }
      return 0;
    };

    // Parse time string to seconds
    const parseTime = (timeStr) => {
      if (!timeStr) return 0;
      const t = timeStr.trim().toUpperCase();
      if (t === 'DQ' || t === 'DNF' || t === 'DNS' || t === '' || t === '-') return 0;
      // h:mm:ss.xx
      const hmsMatch = t.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
      if (hmsMatch) {
        return parseInt(hmsMatch[1], 10) * 3600 + parseInt(hmsMatch[2], 10) * 60 + parseFloat(hmsMatch[3]);
      }
      // mm:ss.xx
      const msMatch = t.match(/^(\d+):(\d+(?:\.\d+)?)$/);
      if (msMatch) {
        return parseInt(msMatch[1], 10) * 60 + parseFloat(msMatch[2]);
      }
      // ss.xx
      const sMatch = t.match(/^(\d+(?:\.\d+)?)$/);
      if (sMatch) {
        return parseFloat(sMatch[1]);
      }
      return 0;
    };

    // Format seconds to Xh Xm Xs
    const formatTotalTime = (totalSeconds) => {
      if (totalSeconds <= 0) return '\u2014';
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = Math.floor(totalSeconds % 60);
      if (h > 0) return `${h}h ${m}m ${s}s`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    };

    let totalDistanceM = 0;
    let totalEntries = 0;
    let totalTimeSec = 0;
    let windValues = [];

    allLifData.forEach((event) => {
      const competitors = event.competitors || [];
      const dist = parseDistance(event.eventName);
      totalDistanceM += dist * competitors.length;
      totalEntries += competitors.length;

      competitors.forEach((comp) => {
        totalTimeSec += parseTime(comp.time);
      });

      // Parse wind
      if (event.wind) {
        const windStr = event.wind.replace(/m\/s/i, '').trim();
        const windVal = parseFloat(windStr);
        if (!isNaN(windVal)) {
          windValues.push(windVal);
        }
      }
    });

    // Format distance
    let totalDistance;
    if (totalDistanceM >= 1000) {
      totalDistance = (totalDistanceM / 1000).toFixed(1) + ' km';
    } else {
      totalDistance = totalDistanceM + ' m';
    }
    if (totalDistanceM === 0 && totalEntries > 0) {
      totalDistance = '0 m';
    }

    // Format wind
    let avgWind = 'N/A';
    if (windValues.length > 0) {
      const avg = windValues.reduce((a, b) => a + b, 0) / windValues.length;
      avgWind = (avg >= 0 ? '+' : '') + avg.toFixed(1) + ' m/s';
    }

    // Extract short event type from full event name (e.g. "U17G 100m H1" → "100m")
    const parseEventType = (eventName) => {
      if (!eventName) return null;
      const name = eventName.toUpperCase();
      // Relay: 4x100m etc.
      const relayMatch = name.match(/(\d+)\s*[xX]\s*(\d+)/);
      if (relayMatch) return `${relayMatch[1]}x${relayMatch[2]}m`;
      // Mile
      if (/\bMILE\b/.test(name)) return 'Mile';
      // Steeplechase: 3000m SC / 3000m Steeplechase
      const scMatch = name.match(/\b(\d[\d,]*)\s*M?\s*(?:STEEPLECHASE|SC)\b/);
      if (scMatch) return `${scMatch[1].replace(/,/g, '')}m SC`;
      // Hurdles: 100mH, 110mH etc.
      const hMatch = name.match(/\b(\d[\d,]*)\s*M?\s*H(?:URDLES?)?\b/);
      if (hMatch) return `${hMatch[1].replace(/,/g, '')}mH`;
      // Flat with M suffix: 100m, 1500m, 10,000m
      const mMatch = name.match(/\b(\d[\d,]*)\s*M\b/);
      if (mMatch) return `${mMatch[1].replace(/,/g, '')}m`;
      return null;
    };

    // Group all finisher speeds by event type, tracking distance for sorting
    const speedsByType = {};
    const distByType = {};
    allLifData.forEach((event) => {
      const dist = parseDistance(event.eventName);
      if (dist === 0) return; // Skip field events
      const eventType = parseEventType(event.eventName);
      if (!eventType) return;
      distByType[eventType] = dist;
      const competitors = event.competitors || [];
      competitors.forEach((comp) => {
        const t = parseTime(comp.time);
        if (t > 0) {
          if (!speedsByType[eventType]) speedsByType[eventType] = [];
          speedsByType[eventType].push(dist / t); // m/s
        }
      });
    });

    // Build eventSpeeds array sorted shortest to longest distance
    const eventSpeeds = Object.keys(speedsByType)
      .sort((a, b) => distByType[a] - distByType[b])
      .map((eventType) => {
        const speeds = speedsByType[eventType];
        const avgMs = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        return { eventName: eventType, speedMs: avgMs, speedMph: avgMs * 2.23694 };
      });

    return {
      totalDistance: totalEntries > 0 ? totalDistance : '\u2014',
      totalDistanceM: totalDistanceM,
      totalAthletes: totalEntries > 0 ? String(totalEntries) : '\u2014',
      totalTime: totalEntries > 0 ? formatTotalTime(totalTimeSec) : '\u2014',
      avgWind: totalEntries > 0 ? avgWind : '\u2014',
      eventSpeeds,
    };
  }, [allLifData]);

  // === EFFECTS ===
  
  // Startup effect
  useEffect(() => {
    const startup = async () => {
      try {
        await EnterFullScreen();
        setAppFullScreen(true);
        addDebugLog("App started in fullscreen");
      } catch (error) {
        addDebugLog("Failed to enter fullscreen on startup");
      }
    };
    startup();
  }, []);

  // Window resize effect
  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch display state from server (for LAN viewers)
  const fetchDisplayState = async () => {
    try {
      const hostname = window.location.hostname;
      const isDesktop = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';
      const baseUrl = isDesktop ? 'http://127.0.0.1:3000' : '';
      const response = await fetch(`${baseUrl}/display-state`);
      if (!response.ok) return;
      const state = await response.json();

      console.log('[LAN] Fetched display state:', {
        mode: state.mode,
        activeText: state.activeText,
        activeTextLength: state.activeText?.length || 0,
        rotationMode: state.rotationMode,
        currentDisplayMode: displayMode,
        currentActiveText: activeText
      });

      // Update rotation mode if different
      if (state.rotationMode && state.rotationMode !== rotationMode) {
        setRotationMode(state.rotationMode);
        addDebugLog(`Rotation mode synced from server: ${state.rotationMode}`);
      }

      // Update layout theme if different
      if (state.layoutTheme && state.layoutTheme !== layoutTheme) {
        setLayoutTheme(state.layoutTheme);
        addDebugLog(`Layout theme synced from server: ${state.layoutTheme}`);
      }

      // Update show bib setting
      if (state.showBib !== undefined && state.showBib !== showBib) {
        setShowBib(state.showBib);
        addDebugLog(`Show bib synced from server: ${state.showBib}`);
      }

      // Update display mode to match server - always sync to ensure UI reflects server state
      if (state.mode) {
        if (state.mode === 'lif') {
          console.log('[LAN] Server mode is lif - clearing display');
          setDisplayMode('lif');
          setActiveText('');
          setLinkedImage('');
          addDebugLog('Display mode synced: LIF');
        } else if (state.mode === 'text') {
          console.log('[LAN] Server mode is text:', state.activeText);
          setDisplayMode('text');
          setActiveText(state.activeText || '');
          addDebugLog(`Display mode synced: Text - "${(state.activeText || '').substring(0, 20)}..."`);
        } else if (state.mode === 'screensaver') {
          console.log('[LAN] Server mode is screensaver');
          setDisplayMode('screensaver');
          setLinkedImage(state.imageBase64 || '');
          addDebugLog('Display mode synced: Screensaver');
        }
      }
    } catch (error) {
      console.error('Error fetching display state:', error);
    }
  };

  // Fetch custom club acronyms from server
  const fetchCustomAcronyms = async () => {
    try {
      const hostname = window.location.hostname;
      const isDesktop = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';
      const baseUrl = isDesktop ? 'http://127.0.0.1:3000' : '';
      const response = await fetch(`${baseUrl}/club-acronyms`);
      if (!response.ok) return;
      const data = await response.json();
      if (data && Object.keys(data).length > 0) {
        setCustomAcronyms(data);
      }
    } catch (err) {
      // Silently fail - custom acronyms are non-critical
    }
  };

  // Data fetching effect - simple polling every 3 seconds
  useEffect(() => {
    fetchLatestData(); // Initial fetch
    fetchAllLifData(); // Initial fetch for stats
    fetchCustomAcronyms(); // Initial fetch for custom acronyms

    // Only fetch display state if we're NOT in the Wails desktop app
    // Desktop app is the source of truth and only posts display state
    const hostname = window.location.hostname;
    const isDesktopApp = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';

    const interval = setInterval(() => {
      fetchLatestData();
      fetchAllLifData();
      if (!isDesktopApp) {
        fetchDisplayState(); // LAN viewers fetch display state from server
      }
    }, 3000);

    // Poll custom acronyms every 10 seconds
    const acronymInterval = setInterval(fetchCustomAcronyms, 10000);

    // Initial display state fetch for LAN viewers
    if (!isDesktopApp) {
      fetchDisplayState();
    }

    return () => {
      clearInterval(interval);
      clearInterval(acronymInterval);
    };
  }, []); // No dependencies - pure polling

  // Web interface info effect
  useEffect(() => {
    async function fetchWebInterfaceInfo() {
      try {
        const info = await GetWebInterfaceInfo();
        setWebInterfaceInfo(info);
        addDebugLog("Web interface info loaded");
      } catch (error) {
        addDebugLog("Failed to load web interface info");
      }
    }
    fetchWebInterfaceInfo();
  }, []);

  // Backend debug logs effect - fetch logs from Go backend
  useEffect(() => {
    const fetchBackendLogs = async () => {
      try {
        const logs = await GetDebugLogs();
        if (logs && logs.length > 0) {
          // Replace debug log with backend logs (they already have timestamps)
          setDebugLog(logs.slice().reverse().slice(0, 20)); // Show last 20, reversed to show newest first
        }
      } catch (error) {
        // Silently fail if backend not available yet
      }
    };

    fetchBackendLogs(); // Initial fetch
    const interval = setInterval(fetchBackendLogs, 1000); // Update every second
    return () => clearInterval(interval);
  }, []);

  // Reset rotation index when mode changes
  useEffect(() => {
    setRotationIndex(0);
    addDebugLog(`Switched to ${rotationMode} mode`);
  }, [rotationMode]);

  // Sync rotation mode changes to server (desktop app only)
  useEffect(() => {
    const hostname = window.location.hostname;
    const isDesktopApp = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';
    if (isDesktopApp && rotationMode) {
      syncDisplayState(displayMode, activeText, linkedImage, rotationMode);
      addDebugLog(`Syncing rotation mode to server: ${rotationMode}`);
    }
  }, [rotationMode]);

  // Sync layout theme changes to server (desktop app only)
  useEffect(() => {
    const hostname = window.location.hostname;
    const isDesktopApp = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';
    if (isDesktopApp && layoutTheme) {
      syncDisplayState(displayMode, activeText, linkedImage, rotationMode);
    }
  }, [layoutTheme]);

  // Sync show bib changes to server (desktop app only)
  useEffect(() => {
    const hostname = window.location.hostname;
    const isDesktopApp = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';
    if (isDesktopApp) {
      syncDisplayState(displayMode, activeText, linkedImage, rotationMode);
    }
  }, [showBib]);

  // Competitor rotation effect
  useEffect(() => {
    if (currentLifData && currentLifData.competitors && currentLifData.competitors.length > 8) {
      const totalCompetitors = currentLifData.competitors.length;
      let maxIndex = 0;
      let increment = 1;

      if (rotationMode === 'scroll') {
        // Scroll mode: rotate through (totalCompetitors - 3) positions, showing 5 at a time
        const rotatingCount = totalCompetitors - 3;
        const windowSize = 5;
        maxIndex = rotatingCount - windowSize;
        increment = 1;
      } else if (rotationMode === 'page') {
        // Page mode: rotate through pages
        const totalPages = Math.ceil(totalCompetitors / 8);
        maxIndex = totalPages - 1;
        increment = 1; // Move one page at a time
      } else if (rotationMode === 'scrollAll') {
        // Scroll All mode: rotate through all competitors
        maxIndex = totalCompetitors - 1;
        increment = 1;
      }

      const intervalId = setInterval(() => {
        setRotationIndex(prevIndex => {
          const nextIndex = prevIndex + increment;
          return nextIndex > maxIndex ? 0 : nextIndex;
        });
      }, 5000);

      addDebugLog(`Started ${rotationMode} rotation for ${totalCompetitors} competitors`);
      return () => clearInterval(intervalId);
    } else {
      // Reset rotation index when switching to a file with 8 or fewer competitors
      setRotationIndex(0);
    }
  }, [currentLifData && currentLifData.competitors ? currentLifData.competitors.length : 0, rotationMode]);

  // Keyboard effect
  useEffect(() => {
    if (expandedTable || appFullScreen) {
      const handleKeyDown = async (e) => {
        if (e.key === 'Escape') {
          if (expandedTable) setExpandedTable(false);
          if (appFullScreen) {
            try {
              await ExitFullScreen();
              setAppFullScreen(false);
            } catch (error) {
              console.log("Fullscreen exit unavailable (remote access)");
              setAppFullScreen(false);
            }
          }
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [expandedTable, appFullScreen]);

  // === HANDLERS ===
  const chooseDirectory = async () => {
    try {
      setError('');
      const dir = await ChooseDirectory();
      setSelectedDir(dir);
      addDebugLog(`Directory selected: ${dir}`);
    } catch (err) {
      console.error('Error selecting directory:', err);
      addDebugLog(`Error selecting directory: ${err.message}`);
      setError('Failed to select directory.');
    }
  };

  const toggleAppFullScreen = async () => {
    try {
      if (appFullScreen) {
        await ExitFullScreen();
        setAppFullScreen(false);
      } else {
        await EnterFullScreen();
        setAppFullScreen(true);
      }
    } catch (error) {
      addDebugLog("Fullscreen toggle unavailable (remote access)");
      console.log("Fullscreen controls only available in desktop app");
    }
  };

  const handleLinkImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const imgUrl = URL.createObjectURL(file);
        setLinkedImage(imgUrl);
        addDebugLog('Image linked successfully');
      }
    };
    input.click();
  };

  // === RENDER FUNCTIONS ===

  // Helper: get cell content and style for a column key
  const getCellContent = (comp, colKey, theme) => {
    const colStyle = (theme.columnStyles && theme.columnStyles[colKey]) || {};
    const base = { ...tableCellStyle, paddingRight: '1ch' };
    switch (colKey) {
      case 'place':
        return { content: comp.place, style: { ...base, textAlign: 'left', ...colStyle } };
      case 'bib':
        return { content: comp.id, style: { ...base, textAlign: 'left', ...colStyle } };
      case 'name':
        return { content: (comp.firstName ? comp.firstName + " " : "") + (comp.lastName || ""), style: { ...base, textAlign: 'left', overflow: 'hidden', textOverflow: 'clip', whiteSpace: 'nowrap', ...colStyle } };
      case 'affiliation':
        return { content: shortenClub(comp.affiliation, customAcronyms), style: { ...base, textAlign: 'left', overflow: 'hidden', textOverflow: 'clip', whiteSpace: 'nowrap', ...colStyle } };
      case 'time':
        return { content: comp.time, style: { ...base, textAlign: 'right', ...colStyle } };
      default:
        return { content: '', style: base };
    }
  };

  const renderLIFTable = () => {
    const theme = THEMES[layoutTheme] || THEMES.classic;
    return (
      <div style={{ ...defaultTableContainerStyle, fontSize: tableFontSize + 'px' }}>
        <table style={{
          width: '100%',
          height: '100%',
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          color: theme.rowText
        }}>
          <colgroup>
            {colPercentages.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: theme.headerBg, color: theme.headerText, fontWeight: 'bold', ...rowStyle }}>
              <th colSpan={headerColSpan} style={headerEventNameStyle}>{currentLifData.eventName}</th>
              <th style={{ ...tableCellStyle, textAlign: 'right', paddingRight: '1ch' }}>{currentLifData.wind}</th>
            </tr>
          </thead>
          <tbody>
            {displayedCompetitors.map((comp, index) => {
              const competitorRowStyle = { ...rowStyle };
              if (currentLifData && currentLifData.competitors.length > 8 && index === 2 && rotationMode === 'scroll') {
                competitorRowStyle.borderBottom = '1px solid black';
              }
              return (
                <tr key={index} style={{ backgroundColor: index % 2 === 0 ? theme.evenRowBg : theme.oddRowBg, ...competitorRowStyle }}>
                  {activeColumns.map((colKey, ci) => {
                    const { content, style } = getCellContent(comp, colKey, theme);
                    return <td key={ci} style={style}>{content}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTextDisplay = () => (
    <div style={{
      ...defaultTableContainerStyle,
      backgroundColor: 'black',
      color: 'white',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      fontSize: '1.5rem',
      textAlign: 'center',
      padding: '10px',
      whiteSpace: 'pre-line'
    }}>
      {activeText}
    </div>
  );

  const renderScreensaver = () => (
    <div style={{ ...defaultTableContainerStyle, backgroundColor: '#000' }}>
      <img src={linkedImage} alt="Screensaver" style={screensaverImageStyle} />
    </div>
  );

  const renderFallback = () => (
    <div style={{
      ...defaultTableContainerStyle,
      fontSize: tableFontSize + 'px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000',
      color: 'white',
      textAlign: 'center',
      padding: '10px'
    }}>
      {!selectedDir ? "Link Your Results Directory To Start" : "Monitoring directory for new results"}
    </div>
  );

  const renderTopLeftDisplay = () => {
    if (expandedTable) return null;

    switch (displayMode) {
      case 'text':
        return activeText ? renderTextDisplay() : renderFallback();
      case 'screensaver':
        return linkedImage ? renderScreensaver() : renderFallback();
      case 'lif':
      default:
        return (currentLifData && currentLifData.competitors && currentLifData.competitors.length > 0) 
          ? renderLIFTable() 
          : renderFallback();
    }
  };

  const renderExpandedDisplay = () => {
    if (!expandedTable) return null;

    // Show text display in expanded mode if active
    if (displayMode === 'text' && activeText) {
      return (
        <div style={{
          ...expandedTableContainerStyle,
          backgroundColor: 'black',
          color: 'white',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontSize: '3rem',
          textAlign: 'center',
          padding: '20px',
          whiteSpace: 'pre-line'
        }}>
          {activeText}
        </div>
      );
    }

    // Show screensaver in expanded mode if active
    if (displayMode === 'screensaver' && linkedImage) {
      return (
        <div style={{ ...expandedTableContainerStyle, backgroundColor: '#000' }}>
          <img src={linkedImage} alt="Screensaver" style={screensaverImageStyle} />
        </div>
      );
    }

    // Default: show LIF table or fallback
    if (currentLifData && currentLifData.competitors && currentLifData.competitors.length > 0) {
      const theme = THEMES[layoutTheme] || THEMES.classic;
      return (
        <div style={{ ...expandedTableContainerStyle, fontSize: tableFontSize + 'px' }}>
          <table style={{
            width: '100%',
            height: '100%',
            tableLayout: 'fixed',
            borderCollapse: 'collapse',
            color: theme.rowText
          }}>
            <colgroup>
              {colPercentages.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: theme.headerBg, color: theme.headerText, fontWeight: 'bold', ...rowStyle }}>
                <th colSpan={headerColSpan} style={headerEventNameStyle}>{currentLifData.eventName}</th>
                <th style={{ ...tableCellStyle, textAlign: 'right', paddingRight: '1ch' }}>{currentLifData.wind}</th>
              </tr>
            </thead>
            <tbody>
              {displayedCompetitors.map((comp, index) => {
                const competitorRowStyle = { ...rowStyle };
                if (currentLifData && currentLifData.competitors.length > 8 && index === 2 && rotationMode === 'scroll') {
                  competitorRowStyle.borderBottom = '1px solid black';
                }
                return (
                  <tr key={index} style={{ backgroundColor: index % 2 === 0 ? theme.evenRowBg : theme.oddRowBg, ...competitorRowStyle }}>
                    {activeColumns.map((colKey, ci) => {
                      const { content, style } = getCellContent(comp, colKey, theme);
                      return <td key={ci} style={style}>{content}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '2px 4px', color: 'white', backgroundColor: 'black' }}>Press Esc to exit expanded table mode.</div>
          <div style={{ padding: '2px 4px', color: 'white', backgroundColor: 'black' }}>Version 3.1.0 - Gordon Lester - support@polyfield.co.uk</div>
        </div>
      );
    } else {
      return (
        <div style={{
          ...expandedTableContainerStyle,
          fontSize: tableFontSize + 'px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
          color: 'white',
          textAlign: 'center',
          padding: '10px'
        }}>
          {!selectedDir ? "Link Your Results Directory To Start" : "Monitoring directory for new results"}
        </div>
      );
    }
  };

  return (
    <div style={containerStyle}>
      {/* Logo on the left side below the preview */}
      <img src={polyfieldLogo} alt="PolyField" style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        height: '80px',
        width: '80px',
        zIndex: 1,
        opacity: 0.9,
      }} />

      {/* Top Left Display - UNCHANGED POSITION */}
      {renderTopLeftDisplay()}

      {/* Expanded Table Display */}
      {renderExpandedDisplay()}

      {/* Control Panel - right half of screen */}
      <div style={controlPanelStyle}>

        {/* Header with logo, title, and directory button */}
        <div style={{
          backgroundColor: '#003366',
          color: '#ffffff',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <img src={polyfieldLogo} alt="PF" style={{ height: '36px', width: '36px' }} />
          <h4 style={{ margin: 0, flex: 1, fontWeight: 'bold', letterSpacing: '0.5px' }}>PolyField - Track</h4>
          <button
            onClick={chooseDirectory}
            style={{
              backgroundColor: selectedDir ? '#1b5e20' : '#e65100',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontWeight: 'bold',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: '0.9rem',
            }}
          >
            {selectedDir ? 'Change Folder' : 'Select Results Folder'}
          </button>
        </div>

        {/* Directory info bar */}
        {selectedDir && (
          <div style={{
            backgroundColor: '#0a1628',
            padding: '10px 20px',
            borderBottom: '1px solid #1a3050',
          }}>
            <div style={{ fontSize: '0.95rem', color: '#e0e0e0', fontWeight: 'bold', marginBottom: '4px' }}>{selectedDir}</div>
            {webInterfaceInfo && <div style={{ fontSize: '1rem', color: '#64b5f6', fontWeight: 'bold' }}>{webInterfaceInfo}</div>}
          </div>
        )}
        {error && (
          <div style={{
            backgroundColor: '#3d0000',
            padding: '6px 20px',
            fontSize: '0.85rem',
            color: '#ff8a80',
          }}>
            {error}
          </div>
        )}

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>

          {/* 1. Text & Screensaver - grouped, most frequently used */}
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #1a3050' }}>
            <h6 style={{ color: '#ffffff', marginBottom: '8px', fontSize: '0.95rem' }}>Display Text &amp; Screensaver</h6>
            <p style={{ color: '#a0b4c8', fontSize: '0.8rem', marginBottom: '8px' }}>
              Show a message or screensaver on all connected screens. Cleared automatically when a new race finishes.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Enter text to display on all screens..."
                rows={4}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  fontSize: '0.95rem',
                  backgroundColor: '#0a1628',
                  color: '#e0e0e0',
                  border: '1px solid #2a4a6b',
                  borderRadius: '6px',
                  resize: 'vertical',
                  fontFamily: 'Arial, sans-serif',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button onClick={showTextDisplay} style={{
                  backgroundColor: '#1565c0', color: '#ffffff', border: 'none', borderRadius: '6px',
                  padding: '10px 16px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem',
                }}>Display</button>
                <button onClick={clearTextDisplay} style={{
                  backgroundColor: 'transparent', color: '#a0b4c8', border: '1px solid #2a4a6b', borderRadius: '6px',
                  padding: '6px 16px', cursor: 'pointer', fontSize: '0.85rem',
                }}>Clear</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={handleLinkImage} style={{
                backgroundColor: 'transparent', color: '#e0e0e0', border: '1px solid #2a4a6b', borderRadius: '6px',
                padding: '6px 14px', cursor: 'pointer', fontSize: '0.85rem',
              }}>
                {linkedImage ? 'Change Image' : 'Link Image'}
              </button>
              <button onClick={showScreensaver} disabled={!linkedImage} style={{
                backgroundColor: linkedImage ? '#1565c0' : '#1a3050', color: linkedImage ? '#ffffff' : '#5a7a9a',
                border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: linkedImage ? 'pointer' : 'default',
                fontSize: '0.85rem',
              }}>Screensaver</button>
              <div style={{ flex: 1 }} />
              <button onClick={restoreLastLIF} disabled={lifDataHistory.length === 0} style={{
                backgroundColor: 'transparent',
                color: lifDataHistory.length > 0 ? '#e0e0e0' : '#5a7a9a',
                border: `1px solid ${lifDataHistory.length > 0 ? '#2a4a6b' : '#1a3050'}`,
                borderRadius: '6px', padding: '6px 14px', cursor: lifDataHistory.length > 0 ? 'pointer' : 'default',
                fontSize: '0.85rem',
              }}>Restore Last Result ({lifDataHistory.length})</button>
            </div>
          </div>

          {/* 2. Full Screen Controls */}
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #1a3050' }}>
            <h6 style={{ color: '#ffffff', marginBottom: '8px', fontSize: '0.95rem' }}>Full Screen</h6>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <button onClick={() => setExpandedTable(!expandedTable)} style={{
                  width: '100%', backgroundColor: expandedTable ? '#2e7d32' : '#1565c0', color: '#ffffff',
                  border: 'none', borderRadius: '6px', padding: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem',
                }}>
                  {expandedTable ? 'Exit Table View' : 'Full Screen Table'}
                </button>
                <p style={{ color: '#a0b4c8', fontSize: '0.78rem', marginTop: '4px', marginBottom: 0 }}>Maximise results on this display</p>
              </div>
              <div style={{ flex: 1 }}>
                <button onClick={toggleAppFullScreen} style={{
                  width: '100%', backgroundColor: appFullScreen ? '#2e7d32' : '#1565c0', color: '#ffffff',
                  border: 'none', borderRadius: '6px', padding: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem',
                }}>
                  {appFullScreen ? 'Exit Full Screen' : 'Full Screen App'}
                </button>
                <p style={{ color: '#a0b4c8', fontSize: '0.78rem', marginTop: '4px', marginBottom: 0 }}>Maximise the entire window</p>
              </div>
            </div>
            <p style={{ color: '#7a9ab8', fontSize: '0.78rem', marginTop: '8px', marginBottom: 0 }}>Press Esc to exit either mode.</p>
          </div>

          {/* 3. Text Size - collapsible */}
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #1a3050' }}>
            <h6
              onClick={() => setShowTextSize(!showTextSize)}
              style={{ color: '#ffffff', marginBottom: showTextSize ? '8px' : 0, fontSize: '0.95rem', cursor: 'pointer', userSelect: 'none' }}
            >
              {showTextSize ? '▾' : '▸'} Text Size ({textMultiplier}%)
            </h6>
            {showTextSize && (
              <>
                <p style={{ color: '#a0b4c8', fontSize: '0.8rem', marginBottom: '8px' }}>
                  Alter the default text size for displays
                </p>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #2a4a6b', borderRadius: 6, overflow: 'hidden' }}>
                  <div
                    onClick={decrementTextMultiplier}
                    style={{
                      flex: 1, textAlign: 'center', padding: '6px 6px', fontSize: '0.8rem',
                      cursor: 'pointer', fontWeight: 'bold', color: '#fff', backgroundColor: '#2e7d32',
                    }}
                  >&#8722;</div>
                  <div style={{
                    flex: 1, textAlign: 'center', padding: '6px 6px', fontSize: '0.8rem',
                    fontWeight: 'bold', color: '#a0b4c8',
                    borderLeft: '1px solid #2a4a6b', borderRight: '1px solid #2a4a6b',
                  }}>{textMultiplier}%</div>
                  <div
                    onClick={incrementTextMultiplier}
                    style={{
                      flex: 1, textAlign: 'center', padding: '6px 6px', fontSize: '0.8rem',
                      cursor: 'pointer', fontWeight: 'bold', color: '#fff', backgroundColor: '#2e7d32',
                    }}
                  >+</div>
                </div>
              </>
            )}
          </div>

          {/* 4. Rotation Mode - collapsible */}
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #1a3050' }}>
            <h6
              onClick={() => setShowRotation(!showRotation)}
              style={{ color: '#ffffff', marginBottom: showRotation ? '8px' : 0, fontSize: '0.95rem', cursor: 'pointer', userSelect: 'none' }}
            >
              {showRotation ? '▾' : '▸'} Rotation Mode
            </h6>
            {showRotation && (
              <>
                <p style={{ color: '#a0b4c8', fontSize: '0.8rem', marginBottom: '8px' }}>
                  Select how results with more than 8 athletes display
                </p>
                <SegmentedControl
                  options={[
                    { value: 'scroll', label: 'Scroll' },
                    { value: 'page', label: 'Page' },
                    { value: 'scrollAll', label: 'Scroll All' },
                  ]}
                  selected={rotationMode}
                  onChange={setRotationMode}
                />
                <p style={{ color: '#7a9ab8', fontSize: '0.78rem', marginTop: '6px', marginBottom: 0 }}>
                  {rotationMode === 'scroll' && 'Top 3 locked, positions 4+ scroll'}
                  {rotationMode === 'page' && 'Pages of 8: 1-8, 9-16, etc.'}
                  {rotationMode === 'scrollAll' && 'All 8 positions scroll through'}
                </p>
              </>
            )}
          </div>

          {/* 5. Display Theme - collapsible */}
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #1a3050' }}>
            <h6
              onClick={() => setShowTheme(!showTheme)}
              style={{ color: '#ffffff', marginBottom: showTheme ? '8px' : 0, fontSize: '0.95rem', cursor: 'pointer', userSelect: 'none' }}
            >
              {showTheme ? '▾' : '▸'} Display Theme
            </h6>
            {showTheme && (
              <>
                <p style={{ color: '#a0b4c8', fontSize: '0.8rem', marginBottom: '8px' }}>
                  Set the default layout and colour scheme for all displays
                </p>
                <SegmentedControl
                  options={Object.entries(THEMES).map(([key, theme]) => ({ value: key, label: theme.name }))}
                  selected={layoutTheme}
                  onChange={setLayoutTheme}
                />
              </>
            )}
          </div>

          {/* 6. Bib Settings - collapsible */}
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #1a3050' }}>
            <h6
              onClick={() => setShowBibs(!showBibs)}
              style={{ color: '#ffffff', marginBottom: showBibs ? '8px' : 0, fontSize: '0.95rem', cursor: 'pointer', userSelect: 'none' }}
            >
              {showBibs ? '▾' : '▸'} Bib Settings
            </h6>
            {showBibs && (
              <>
                <p style={{ color: '#a0b4c8', fontSize: '0.8rem', marginBottom: '8px' }}>
                  Show or hide bibs from the displays
                </p>
                <SegmentedControl
                  options={[
                    { value: true, label: 'Show Bibs' },
                    { value: false, label: 'Hide Bibs' },
                  ]}
                  selected={showBib}
                  onChange={setShowBib}
                />
              </>
            )}
          </div>

          {/* 6. Web Views - collapsible */}
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #1a3050' }}>
            <h6
              onClick={() => setShowWebViews(!showWebViews)}
              style={{ color: '#ffffff', marginBottom: showWebViews ? '8px' : 0, fontSize: '0.95rem', cursor: 'pointer', userSelect: 'none' }}
            >
              {showWebViews ? '▾' : '▸'} Web Views
            </h6>
            {showWebViews && (
              <>
                <p style={{ color: '#a0b4c8', fontSize: '0.8rem', marginBottom: '8px' }}>
                  Open display pages accessible to anyone on the local network.
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <Link to="/results" style={{ flex: 1, textDecoration: 'none' }}>
                    <button style={{
                      width: '100%', backgroundColor: '#1565c0', color: '#ffffff', border: 'none',
                      borderRadius: '6px', padding: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem',
                    }}>Multi Result Mode</button>
                  </Link>
                  <button onClick={() => {
                    const hn = window.location.hostname;
                    const isDesktop = hn === '' || hn === 'wails.localhost' || window.location.protocol === 'wails:';
                    window.open(isDesktop ? 'http://127.0.0.1:3000/athlete' : `${window.location.origin}/athlete`, '_blank');
                  }} style={{
                    flex: 1, backgroundColor: '#1565c0', color: '#ffffff', border: 'none',
                    borderRadius: '6px', padding: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem',
                  }}>
                    <span style={{ marginRight: '6px' }}>&#128269;</span>Athlete Search
                  </button>
                  <button onClick={() => setShowSocialGraphic(true)} style={{
                    flex: 1, backgroundColor: '#e65100', color: '#ffffff', border: 'none',
                    borderRadius: '6px', padding: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem',
                  }}>Social Graphic</button>
                </div>
              </>
            )}
          </div>

          {/* 7. Competition Stats - collapsible */}
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #1a3050' }}>
            <h6
              onClick={() => setShowStats(!showStats)}
              style={{ color: '#ffffff', marginBottom: showStats ? '8px' : 0, fontSize: '0.95rem', cursor: 'pointer', userSelect: 'none' }}
            >
              {showStats ? '▾' : '▸'} Competition Stats
            </h6>
            {showStats && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { value: competitionStats.totalDistance, label: 'Total Distance' },
                  { value: competitionStats.totalAthletes, label: 'Race Entries' },
                  { value: competitionStats.totalTime, label: 'Total Race Time' },
                  { value: competitionStats.avgWind, label: 'Average Wind' },
                ].map((stat, i) => (
                  <div key={i} style={{
                    backgroundColor: '#0a1628',
                    border: '1px solid #1a3050',
                    borderRadius: '8px',
                    padding: '12px',
                    textAlign: 'center',
                  }}>
                    <div style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '2px' }}>
                      {stat.value}
                    </div>
                    <div style={{ color: '#7a9ab8', fontSize: '0.75rem' }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: '6px 20px',
          fontSize: '0.78rem',
          color: '#7a9ab8',
          borderTop: '1px solid #1a3050',
          backgroundColor: '#0a1628',
        }}>
          Version 3.1.0 - Gordon Lester - support@polyfield.co.uk
        </div>
      </div>

      {/* Debug Log Display */}
      {debugLog.length > 0 && !expandedTable && (
        <div style={{
          position: 'absolute',
          top: '196px',
          left: '2px',
          width: '384px',
          maxHeight: '150px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: '#00ff00',
          fontSize: '10px',
          fontFamily: 'monospace',
          padding: '5px',
          zIndex: 1,
          overflow: 'auto',
          border: '1px solid #333'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>
            Debug Log: (Mode: {displayMode}, History: {lifDataHistory.length}, ModTime: {lastModifiedTimeRef.current})
          </div>
          {debugLog.map((log, index) => (
            <div key={index} style={{ marginBottom: '1px' }}>{log}</div>
          ))}
        </div>
      )}

      {/* Social Graphic Modal */}
      <SocialGraphic
        isOpen={showSocialGraphic}
        onClose={() => setShowSocialGraphic(false)}
        stats={competitionStats}
        onSave={async (dataUrl, units) => {
          const path = await SaveGraphic(dataUrl, units);
          addDebugLog(`Graphic saved: ${path}`);
          return path;
        }}
      />
    </div>
  );
}

export default App;