import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChooseDirectory, EnterFullScreen, ExitFullScreen, GetWebInterfaceInfo } from "../wailsjs/go/main/App";
import polyfieldLogo from './polyfield-logo.png';

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

// Table cell style: fixed layout, no wrapping, clipped overflow.
const tableCellStyle = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'clip',
  padding: '0px',
  margin: '0px'
};

// Compute column widths in "ch" units for five columns
const computeColumnWidthsCh = (competitors) => {
  let col1 = 3;
  let col2 = 4;
  let col3 = 5;
  let col4 = 5;
  let col5 = 5;
  if (competitors && competitors.length > 0) {
    col3 = competitors.reduce((max, comp) => {
      const fullName = (comp.firstName ? comp.firstName + " " : "") + (comp.lastName || "");
      return fullName.length > max ? fullName.length : max;
    }, 0) + 1;
    
    const sumAffiliation = competitors.reduce((sum, comp) => sum + (comp.affiliation ? comp.affiliation.length : 0), 0);
    const avgAffiliation = Math.ceil(sumAffiliation / competitors.length) + 1;
    col4 = Math.min(avgAffiliation, 12);
    
    const maxTime = competitors.reduce((max, comp) => {
      const len = comp.time ? comp.time.length : 0;
      return len > max ? len : max;
    }, 0);
    col5 = Math.min(maxTime + 1, 12);
    if (col3 <= col4) {
      col3 = col4 + 1;
    }
  }
  const totalCh = col1 + col2 + col3 + col4 + col5;
  return { col1, col2, col3, col4, col5, totalCh };
};

// Ensure the header event name cell clips so the Wind cell remains visible.
const eventNameCellStyle = (colPercentages) => ({
  ...tableCellStyle,
  textAlign: 'left',
  maxWidth: `calc(${colPercentages.w1} + ${colPercentages.w2} + ${colPercentages.w3} + ${colPercentages.w4})`
});

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
  const [textMultiplier, setTextMultiplier] = useState(62); // Default +2 from original
  const [expandedTable, setExpandedTable] = useState(false);
  const [appFullScreen, setAppFullScreen] = useState(false);
  const [rotationIndex, setRotationIndex] = useState(0);
  const [rotationMode, setRotationMode] = useState('scroll'); // 'scroll', 'page', or 'scrollAll'
  
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

  // Compute relative column widths as percentages.
  const colPercentages = useMemo(() => {
    const { col1, col2, col3, col4, col5 } = computeColumnWidthsCh(displayedCompetitors);
    const total = col1 + col2 + col3 + col4 + col5;
    return {
      w1: (col1 / total) * 100 + '%',
      w2: (col2 / total) * 100 + '%',
      w3: (col3 / total) * 100 + '%',
      w4: (col4 / total) * 100 + '%',
      w5: (col5 / total) * 100 + '%'
    };
  }, [displayedCompetitors]);

  // Compute style for header event name cell.
  const headerEventNameStyle = useMemo(() => eventNameCellStyle(colPercentages), [colPercentages]);

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

  // Data fetching effect - simple polling every 3 seconds
  useEffect(() => {
    fetchLatestData(); // Initial fetch

    // Only fetch display state if we're NOT in the Wails desktop app
    // Desktop app is the source of truth and only posts display state
    const hostname = window.location.hostname;
    const isDesktopApp = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';

    const interval = setInterval(() => {
      fetchLatestData();
      if (!isDesktopApp) {
        fetchDisplayState(); // LAN viewers fetch display state from server
      }
    }, 3000);

    // Initial display state fetch for LAN viewers
    if (!isDesktopApp) {
      fetchDisplayState();
    }

    return () => clearInterval(interval);
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
  const renderLIFTable = () => (
    <div style={{ ...defaultTableContainerStyle, fontSize: tableFontSize + 'px' }}>
      <table style={{
        width: '100%',
        height: '100%',
        tableLayout: 'fixed',
        borderCollapse: 'collapse',
        color: 'white'
      }}>
        <colgroup>
          <col style={{ width: colPercentages.w1 }} />
          <col style={{ width: colPercentages.w2 }} />
          <col style={{ width: colPercentages.w3 }} />
          <col style={{ width: colPercentages.w4 }} />
          <col style={{ width: colPercentages.w5 }} />
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: '#003366', fontWeight: 'bold', ...rowStyle }}>
            <th colSpan="4" style={headerEventNameStyle}>{currentLifData.eventName}</th>
            <th style={{ ...tableCellStyle, textAlign: 'right', paddingRight: '1ch' }}>{currentLifData.wind}</th>
          </tr>
        </thead>
        <tbody>
          {displayedCompetitors.map((comp, index) => {
            const competitorRowStyle = { ...rowStyle };
            // Show border after row 2 only in scroll mode to indicate locked top 3
            if (currentLifData && currentLifData.competitors.length > 8 && index === 2 && rotationMode === 'scroll') {
              competitorRowStyle.borderBottom = '1px solid black';
            }
            return (
              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#191970' : '#4682B4', ...competitorRowStyle }}>
                <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.place}</td>
                <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.id}</td>
                <td style={{ ...tableCellStyle, textAlign: 'left' }}>
                  {(comp.firstName ? comp.firstName + " " : "") + (comp.lastName || "")}
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.affiliation}</td>
                <td style={{ ...tableCellStyle, textAlign: 'right', paddingRight: '1ch' }}>{comp.time}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

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
      return (
        <div style={{ ...expandedTableContainerStyle, fontSize: tableFontSize + 'px' }}>
          <table style={{
            width: '100%',
            height: '100%',
            tableLayout: 'fixed',
            borderCollapse: 'collapse',
            color: 'white'
          }}>
            <colgroup>
              <col style={{ width: colPercentages.w1 }} />
              <col style={{ width: colPercentages.w2 }} />
              <col style={{ width: colPercentages.w3 }} />
              <col style={{ width: colPercentages.w4 }} />
              <col style={{ width: colPercentages.w5 }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#003366', fontWeight: 'bold', ...rowStyle }}>
                <th colSpan="4" style={headerEventNameStyle}>{currentLifData.eventName}</th>
                <th style={{ ...tableCellStyle, textAlign: 'right', paddingRight: '1ch' }}>{currentLifData.wind}</th>
              </tr>
            </thead>
            <tbody>
              {displayedCompetitors.map((comp, index) => {
                const competitorRowStyle = { ...rowStyle };
                // Show border after row 2 only in scroll mode to indicate locked top 3
                if (currentLifData && currentLifData.competitors.length > 8 && index === 2 && rotationMode === 'scroll') {
                  competitorRowStyle.borderBottom = '1px solid black';
                }
                return (
                  <tr key={index} style={{ backgroundColor: index % 2 === 0 ? '#191970' : '#4682B4', ...competitorRowStyle }}>
                    <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.place}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.id}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'left' }}>
                      {(comp.firstName ? comp.firstName + " " : "") + (comp.lastName || "")}
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.affiliation}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', paddingRight: '1ch' }}>{comp.time}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '2px 4px', color: 'white', backgroundColor: 'black' }}>Press Esc to exit expanded table mode.</div>
          <div style={{ padding: '2px 4px', color: 'white', backgroundColor: 'black' }}>Version 3.0.0 - Gordon Lester - support@polyfield.co.uk</div>
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

          {/* 3. Text Size + Rotation Mode - side by side */}
          <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #1a3050' }}>
            <div style={{ display: 'flex', gap: '24px' }}>
              {/* Text Size */}
              <div>
                <h6 style={{ color: '#ffffff', marginBottom: '8px', fontSize: '0.95rem' }}>Text Size</h6>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={decrementTextMultiplier} style={{
                    backgroundColor: '#1565c0', color: '#ffffff', border: 'none', borderRadius: '6px',
                    padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem',
                  }}>&#8722;</button>
                  <span style={{ minWidth: '44px', textAlign: 'center', fontWeight: 'bold', fontSize: '1rem', color: '#ffffff' }}>{textMultiplier}%</span>
                  <button onClick={incrementTextMultiplier} style={{
                    backgroundColor: '#1565c0', color: '#ffffff', border: 'none', borderRadius: '6px',
                    padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem',
                  }}>+</button>
                </div>
              </div>

              {/* Rotation Mode */}
              <div style={{ flex: 1 }}>
                <h6 style={{ color: '#ffffff', marginBottom: '8px', fontSize: '0.95rem' }}>Rotation Mode</h6>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  {['scroll', 'page', 'scrollAll'].map((mode) => (
                    <button key={mode} onClick={() => setRotationMode(mode)} style={{
                      flex: 1, backgroundColor: rotationMode === mode ? '#2e7d32' : 'transparent',
                      color: rotationMode === mode ? '#ffffff' : '#a0b4c8',
                      border: `1px solid ${rotationMode === mode ? '#2e7d32' : '#2a4a6b'}`,
                      borderRadius: '6px', padding: '6px 8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: rotationMode === mode ? 'bold' : 'normal',
                    }}>
                      {mode === 'scrollAll' ? 'Scroll All' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
                <p style={{ color: '#7a9ab8', fontSize: '0.78rem', marginBottom: 0 }}>
                  {rotationMode === 'scroll' && 'Top 3 locked, positions 4+ scroll'}
                  {rotationMode === 'page' && 'Pages of 8: 1-8, 9-16, etc.'}
                  {rotationMode === 'scrollAll' && 'All 8 positions scroll through'}
                </p>
              </div>
            </div>
          </div>

          {/* 4. Web Views */}
          <div>
            <h6 style={{ color: '#ffffff', marginBottom: '8px', fontSize: '0.95rem' }}>Web Views</h6>
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
              <button onClick={() => window.open('/athlete', '_blank')} style={{
                flex: 1, backgroundColor: '#1565c0', color: '#ffffff', border: 'none',
                borderRadius: '6px', padding: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem',
              }}>
                <span style={{ marginRight: '6px' }}>&#128269;</span>Athlete Search
              </button>
            </div>
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
          Version 3.0.0 - Gordon Lester - support@polyfield.co.uk
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
    </div>
  );
}

export default App;