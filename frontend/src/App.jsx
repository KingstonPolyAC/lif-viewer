import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChooseDirectory, EnterFullScreen, ExitFullScreen, GetWebInterfaceInfo } from "../wailsjs/go/main/App";
import welcomeImage from './welcome.png';

// Fixed dimensions for the default table container.
const DEFAULT_TABLE_HEIGHT = 192; // in pixels
const DEFAULT_TABLE_WIDTH = 384;  // in pixels

// Main container with diagonal background.
const containerStyle = {
  width: '100vw',
  height: '100vh',
  position: 'relative',
  background: 'linear-gradient(135deg, navy 0%, navy 40%, white 40%, white 60%, black 60%, black 100%)',
  overflow: 'hidden',
};

// Background image.
const backgroundImageStyle = {
  position: 'absolute',
  top: '50px',
  right: '50px',
  height: '150px',
  width: '150px',
  zIndex: 0,
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

// Control Panel container in bottom right.
const controlPanelStyle = {
  position: 'absolute',
  width: '350px',
  maxHeight: '70vh',
  bottom: '30px',
  right: '30px',
  zIndex: 3,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px'
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
      {!selectedDir ? "Link Your LIF Result Directory To Start" : "Monitoring directory for new LIF files or changes"}
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
          <div style={{ padding: '2px 4px', color: 'white', backgroundColor: 'black' }}>Version 2.0.0 - Gordon Lester - web@kingstonandpoly.org</div>
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
          {!selectedDir ? "Link Your LIF Result Directory To Start" : "Monitoring directory for new LIF files or changes"}
        </div>
      );
    }
  };

  return (
    <div style={containerStyle}>
      {/* Background image */}
      <img src={welcomeImage} alt="Welcome" style={backgroundImageStyle} />

      {/* Top Left Display */}
      {renderTopLeftDisplay()}

      {/* Expanded Table Display */}
      {renderExpandedDisplay()}

      {/* Control Panel */}
      <div className="card shadow mb-4" style={controlPanelStyle}>
        <div className="card-header">
          <h3 className="card-title m-0">Control Panel</h3>
        </div>
        <div className="card-body" style={{ overflowY: 'auto', maxHeight: '60vh' }}>
          {/* Directory Section */}
          <div className="mb-1 pb-1 border-bottom">
            <h5 className="mb-1">Link to Lynx Results</h5>
            <button className="btn btn-primary w-100" onClick={chooseDirectory}>
              Select Results Directory
            </button>
            {error && <p className="mt-2 text-danger">{error}</p>}
            {selectedDir && <p className="mt-2 text-muted">{selectedDir}</p>}
            {selectedDir && <p className="mt-2 text-muted">{webInterfaceInfo}</p>}
          </div>
          
          {/* Screen Controls Section */}
          <div className="mb-1 pb-1 border-bottom">
            <h5 className="mb-1">Adjust View</h5>
            <div className="row g-2">
              <div className="col">
                <button className="btn btn-primary w-100" onClick={() => setExpandedTable(!expandedTable)}>
                  Full Screen Table
                </button>
              </div>
              <div className="col">
                <button className="btn btn-primary w-100" onClick={toggleAppFullScreen}>
                  Full Screen App
                </button>
              </div>
            </div>
            <p className="mt-2 text-muted">Tip: Press Esc to exit full screen modes.</p>
          </div>
          
          {/* Text Size Section */}
          <div className="mb-1 pb-1 border-bottom">
            <h5 className="mb-1">Adjust Text Size</h5>
            <div className="row g-2">
              <div className="col">
                <button className="btn btn-primary w-100" onClick={decrementTextMultiplier}>
                  Smaller
                </button>
              </div>
              <div className="col">
                <button className="btn btn-primary w-100" onClick={incrementTextMultiplier}>
                  Larger
                </button>
              </div>
            </div>
          </div>

          {/* Rotation Mode Section */}
          <div className="mb-1 pb-1 border-bottom">
            <h5 className="mb-1">Rotation Mode</h5>
            <div className="row g-2">
              <div className="col-4">
                <button
                  className={`btn w-100 ${rotationMode === 'scroll' ? 'btn-success' : 'btn-secondary'}`}
                  onClick={() => setRotationMode('scroll')}
                >
                  Scroll
                </button>
              </div>
              <div className="col-4">
                <button
                  className={`btn w-100 ${rotationMode === 'page' ? 'btn-success' : 'btn-secondary'}`}
                  onClick={() => setRotationMode('page')}
                >
                  Page
                </button>
              </div>
              <div className="col-4">
                <button
                  className={`btn w-100 ${rotationMode === 'scrollAll' ? 'btn-success' : 'btn-secondary'}`}
                  onClick={() => setRotationMode('scrollAll')}
                >
                  Scroll All
                </button>
              </div>
            </div>
            <p className="mt-2 text-muted" style={{ fontSize: '0.85rem' }}>
              {rotationMode === 'scroll' && 'Top 3 locked, remaining scroll'}
              {rotationMode === 'page' && 'Pages: 1-8, 9-16, etc.'}
              {rotationMode === 'scrollAll' && 'All positions scroll'}
            </p>
          </div>
          
          {/* Image/Screensaver Section */}
          <div className="mb-1 pb-1 border-bottom">
            <div className="row g-2">
              <div className="col">
                <button className="btn btn-primary w-100" onClick={handleLinkImage}>
                  Link Image
                </button>
              </div>
              <div className="col">
                <button className="btn btn-primary w-100" onClick={showScreensaver}>
                  Screensaver
                </button>
              </div>
            </div>
            <p className="mt-2 text-muted">
              {linkedImage ? "Image linked." : "No image linked yet."}
            </p>
          </div>
          
          {/* Multi LIF Display Section */}
          <div className="mb-1">
            <Link to="/results">
              <button className="btn btn-primary w-100">Multi LIF Mode</button>
            </Link>
          </div>
        </div>
        <div className="card-footer text-muted">
          Version 2.0.0 - Gordon Lester - web@kingstonandpoly.org
        </div>
      </div>

      {/* Text Input Bar - Hidden in expanded table mode */}
      {!expandedTable && (
        <div style={{
          position: 'fixed',
          bottom: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#000',
          color: 'white',
          padding: '10px',
          zIndex: 11,
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start'
        }}>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Enter display text... (Use line breaks for multiple lines)"
          rows={3}
          style={{
            padding: '10px',
            fontSize: '1rem',
            backgroundColor: '#111',
            color: 'white',
            border: '1px solid white',
            borderRadius: '4px',
            width: '400px',
            resize: 'vertical',
            fontFamily: 'Arial, sans-serif'
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <button
            className="btn btn-primary"
            onClick={showTextDisplay}
          >
            Display Text
          </button>
          <button
            className="btn btn-secondary"
            onClick={clearTextDisplay}
            style={{
              fontSize: '0.9rem',
              padding: '5px 10px',
              backgroundColor: '#666',
              border: '1px solid white'
            }}
          >
            Clear Text
          </button>
        </div>
      </div>
      )}

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