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
  bottom: '30px',
  right: '30px',
  zIndex: 3,
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
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
      const response = await fetch("/latest-lif");
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

  // === DISPLAY MODE HANDLERS ===
  const showTextDisplay = () => {
    setActiveText(inputText);
    setDisplayMode('text');
    addDebugLog(`Text display: "${inputText.substring(0, 30)}..."`);
  };

  const clearTextDisplay = () => {
    setActiveText('');
    setDisplayMode('lif');
    addDebugLog('Text cleared - showing LIF');
  };

  const showScreensaver = () => {
    if (!linkedImage) {
      alert('Please link a PNG image first.');
      return;
    }
    setDisplayMode('screensaver');
    addDebugLog('Screensaver activated');
  };

  const restoreLastLIF = () => {
    if (lifDataHistory.length > 0) {
      const lastLIF = lifDataHistory[0];
      setCurrentLifData(lastLIF);
      lastModifiedTimeRef.current = lastLIF.modifiedTime || 0;
      setDisplayMode('lif');
      setLifDataHistory(prev => prev.slice(1)); // Remove restored item
      addDebugLog(`Restored: ${lastLIF.eventName || 'Unknown'}`);
    } else {
      addDebugLog('No previous LIF data available');
    }
  };

  // === COMPUTED VALUES ===
  const displayedCompetitors = useMemo(() => {
    const comps = (currentLifData && currentLifData.competitors) || [];
    if (comps.length > 8) {
      const fixed = comps.slice(0, 3);
      const rotating = comps.slice(3);
      const windowSize = 5;
      let rollingDisplayed = rotating.slice(rotationIndex, rotationIndex + windowSize);
      if (rollingDisplayed.length < windowSize) {
        rollingDisplayed = rollingDisplayed.concat(rotating.slice(0, windowSize - rollingDisplayed.length));
      }
      return fixed.concat(rollingDisplayed);
    } else {
      const result = comps.slice(0, 8);
      while (result.length < 8) {
        result.push({ place: "", id: "", firstName: "", lastName: "", affiliation: "", time: "" });
      }
      return result;
    }
  }, [currentLifData, rotationIndex]);

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

  // Data fetching effect - simple polling every 3 seconds
  useEffect(() => {
    fetchLatestData(); // Initial fetch
    const interval = setInterval(fetchLatestData, 3000);
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

  // Competitor rotation effect
  useEffect(() => {
    if (currentLifData && currentLifData.competitors && currentLifData.competitors.length > 8) {
      const rotatingCount = currentLifData.competitors.length - 3;
      const windowSize = 5;
      const maxIndex = rotatingCount - windowSize;
      const intervalId = setInterval(() => {
        setRotationIndex(prevIndex => (prevIndex >= maxIndex ? 0 : prevIndex + 1));
      }, 5000);
      addDebugLog(`Started rotation for ${currentLifData.competitors.length} competitors`);
      return () => clearInterval(intervalId);
    }
  }, [currentLifData && currentLifData.competitors ? currentLifData.competitors.length : 0]);

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
            if (currentLifData && currentLifData.competitors.length > 8 && index === 2) {
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
                if (currentLifData && currentLifData.competitors.length > 8 && index === 2) {
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
          <div style={{ padding: '2px 4px', color: 'white', backgroundColor: 'black' }}>Version 1.3.3 - Gordon Lester - web@kingstonandpoly.org</div>
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
        <div className="card-body">
          {/* Directory Section */}
          <div className="mb-3 pb-3 border-bottom">
            <h5 className="mb-3">Link to Lynx Results</h5>
            <button className="btn btn-primary w-100" onClick={chooseDirectory}>
              Select Results Directory
            </button>
            {error && <p className="mt-2 text-danger">{error}</p>}
            {selectedDir && <p className="mt-2 text-muted">{selectedDir}</p>}
            {selectedDir && <p className="mt-2 text-muted">{webInterfaceInfo}</p>}
          </div>
          
          {/* Screen Controls Section */}
          <div className="mb-3 pb-3 border-bottom">
            <h5 className="mb-3">Adjust View</h5>
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
          <div className="mb-3 pb-3 border-bottom">
            <h5 className="mb-3">Adjust Text Size</h5>
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
          
          {/* Image/Screensaver Section */}
          <div className="mb-3 pb-3 border-bottom">
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
          <div className="mb-3">
            <Link to="/results">
              <button className="btn btn-primary w-100">Multi LIF Mode</button>
            </Link>
          </div>
        </div>
        <div className="card-footer text-muted">
          Version 1.3.7 - Gordon Lester - web@kingstonandpoly.org
        </div>
      </div>

      {/* Text Input Bar */}
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