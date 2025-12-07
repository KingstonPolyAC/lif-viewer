import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GetAllLIFData, ChooseDirectory, EnterFullScreen, ExitFullScreen, GetWebInterfaceInfo } from '../wailsjs/go/main/App';

function Results() {
  const navigate = useNavigate();
  const hostname = window.location.hostname;
  const isDesktopApp = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';

  // State for LIF data and display settings
  const [lifDataArray, setLifDataArray] = useState([]);
  const [layout, setLayout] = useState('2x2'); // Only "2x2" or "3x2" allowed
  const [displayMode, setDisplayMode] = useState('rotate'); // "rotate" or "latest"
  const [rotateIndex, setRotateIndex] = useState(0);
  const [textMultiplier, setTextMultiplier] = useState(60); // as a percentage
  const [error, setError] = useState('');
  const [selectedDir, setSelectedDir] = useState('');
  const [refreshFlag, setRefreshFlag] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // New state for view mode (multi-grid or full-screen-table)
  const [viewMode, setViewMode] = useState('multi'); // 'multi' or 'fullscreen'
  const [currentLIF, setCurrentLIF] = useState(null); // Current single event from desktop
  const [rotationMode, setRotationMode] = useState('scroll'); // Synced from desktop

  // Display mode synced from desktop (for text/screensaver overlays)
  const [syncedDisplayMode, setSyncedDisplayMode] = useState('lif'); // 'lif', 'text', or 'screensaver'
  const [syncedActiveText, setSyncedActiveText] = useState('');
  const [syncedImageBase64, setSyncedImageBase64] = useState('');

  // Auto-hide control bar for web browsers
  const [showControls, setShowControls] = useState(true);
  const [hideTimeout, setHideTimeout] = useState(null);

  // Separate rotation indices for multi-grid and full-screen modes
  const [fullScreenRotateIndex, setFullScreenRotateIndex] = useState(0);

  // Ref to measure actual control panel height
  const controlPanelRef = useRef(null);
  const [controlPanelHeight, setControlPanelHeight] = useState(120);

  // Ref to track previous lifDataArray length
  const prevArrayLengthRef = useRef(0);
  const lifDataArrayRef = useRef(lifDataArray);

  // Fetch all LIF data every 3 seconds using HTTP endpoint (works for both local and remote access)
  useEffect(() => {
    async function fetchData() {
      try {
        // Desktop app: use local server. Web browser: use relative URLs
        const hostname = window.location.hostname;
        const isDesktop = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';
        const baseUrl = isDesktop ? 'http://127.0.0.1:3000' : '';
        const response = await fetch(`${baseUrl}/all-lif`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setLifDataArray(data || []);
      } catch (err) {
        console.error('Error fetching LIF data:', err);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [refreshFlag]);

  // Fetch display state from server (for current LIF, rotation mode, and display overlays)
  useEffect(() => {
    async function fetchDisplayState() {
      try {
        const hostname = window.location.hostname;
        const isDesktop = hostname === '' || hostname === 'wails.localhost' || window.location.protocol === 'wails:';
        const baseUrl = isDesktop ? 'http://127.0.0.1:3000' : '';
        const response = await fetch(`${baseUrl}/display-state`);
        if (!response.ok) return;
        const state = await response.json();

        // Update current LIF if available
        if (state.currentLIF) {
          setCurrentLIF(state.currentLIF);
        }

        // Update rotation mode if available
        if (state.rotationMode) {
          setRotationMode(state.rotationMode);
        }

        // Update display mode and overlays (text/screensaver)
        if (state.mode) {
          setSyncedDisplayMode(state.mode);
        }
        if (state.activeText !== undefined) {
          setSyncedActiveText(state.activeText);
        }
        if (state.imageBase64 !== undefined) {
          setSyncedImageBase64(state.imageBase64);
        }
      } catch (err) {
        console.error('Error fetching display state:', err);
      }
    }
    fetchDisplayState();
    const interval = setInterval(fetchDisplayState, 3000);
    return () => clearInterval(interval);
  }, []);

  // Text size adjustment functions
  const incrementTextMultiplier = () => setTextMultiplier(prev => Math.min(prev + 5, 200));
  const decrementTextMultiplier = () => setTextMultiplier(prev => Math.max(prev - 5, 5));

  // Directory selection function (desktop only)
  const chooseDirectory = async () => {
    try {
      setError('');
      const dir = await ChooseDirectory();
      setSelectedDir(dir);
    } catch (err) {
      console.error('Error selecting directory:', err);
      setError('Failed to select directory.');
    }
  };

  // Toggle full screen mode: when full screen, hide the control panel.
  const toggleFullScreen = async () => {
    try {
      if (isFullScreen) {
        await ExitFullScreen();
        setIsFullScreen(false);
      } else {
        await EnterFullScreen();
        setIsFullScreen(true);
      }
    } catch (error) {
      console.log("Fullscreen controls only available in desktop app");
    }
  };

  // Listen for Esc key to exit full screen
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (e.key === 'Escape' && isFullScreen) {
        try {
          await ExitFullScreen();
          setIsFullScreen(false);
        } catch (error) {
          console.log("Fullscreen exit unavailable (remote access)");
          setIsFullScreen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  // Auto-hide controls on mouse inactivity (web browsers only)
  useEffect(() => {
    if (isDesktopApp) return; // Desktop always shows controls

    const handleMouseMove = () => {
      setShowControls(true);

      // Clear existing timeout
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }

      // Set new timeout to hide controls after 3 seconds of no movement
      const newTimeout = setTimeout(() => {
        setShowControls(false);
      }, 3000);

      setHideTimeout(newTimeout);
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
    };
  }, [isDesktopApp, hideTimeout]);

  // Grid count based on layout (2x2 = 4 panels; 3x2 = 6 panels)
  const gridCount = useMemo(() => (layout === '2x2' ? 4 : 6), [layout]);

  // Determine displayed LIFs based on mode:
  // - In Rotate mode, paginate through events (newest to oldest)
  // - In Latest mode, show the most recently changed files ordered newest-to-oldest.
  const displayedLIFs = useMemo(() => {
    if (lifDataArray.length <= gridCount) {
      const result = lifDataArray.slice(0, gridCount);
      while (result.length < gridCount) {
        result.push({ eventName: "", wind: "", competitors: [] });
      }
      return result;
    } else {
      if (displayMode === 'rotate') {
        // Rotate mode: paginate through events
        // Array is sorted oldest→newest: [A,B,C,D,E,F]
        // Reverse to newest→oldest for pagination: [F,E,D,C,B,A]
        // Page 0: [F,E,D,C], Page 1: [B,A], etc. (no wrapping, fill with empty)
        const reversed = [...lifDataArray].reverse();
        const totalPages = Math.ceil(reversed.length / gridCount);
        const currentPage = rotateIndex % totalPages;
        const startIdx = currentPage * gridCount;
        const page = [];
        for (let i = 0; i < gridCount; i++) {
          const idx = startIdx + i;
          if (idx < reversed.length) {
            page.push(reversed[idx]);
          } else {
            page.push({ eventName: "", wind: "", competitors: [] });
          }
        }
        return page;
      } else {
        // Latest mode: take the newest gridCount items, arranged left-to-right newest to oldest
        const latest = lifDataArray.length >= gridCount
          ? lifDataArray.slice(-gridCount).reverse()
          : lifDataArray.slice(0, gridCount);
        while (latest.length < gridCount) {
          latest.push({ eventName: "", wind: "", competitors: [] });
        }
        return latest;
      }
    }
  }, [lifDataArray, gridCount, displayMode, rotateIndex]);

  // Keep ref updated with latest lifDataArray
  useEffect(() => {
    lifDataArrayRef.current = lifDataArray;
  }, [lifDataArray]);

  // When array length changes (new event added), reset to page 0
  // New events wait for pagination cycle to restart
  useEffect(() => {
    if (prevArrayLengthRef.current !== 0 && prevArrayLengthRef.current !== lifDataArray.length) {
      setRotateIndex(0);
    }
    prevArrayLengthRef.current = lifDataArray.length;
  }, [lifDataArray.length]);

  // In Rotate mode, advance to next page every 5 seconds
  useEffect(() => {
    if (displayMode === 'rotate' && lifDataArray.length > gridCount) {
      const intervalId = setInterval(() => {
        setRotateIndex(prev => prev + 1);
      }, 5000);
      return () => clearInterval(intervalId);
    } else {
      // Reset to 0 when not rotating
      setRotateIndex(0);
    }
  }, [displayMode, gridCount, lifDataArray.length]);

  // Track window size for responsive layout
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Measure actual control panel height for accurate full-screen table sizing
  useEffect(() => {
    const measureControlPanel = () => {
      if (controlPanelRef.current) {
        const height = controlPanelRef.current.offsetHeight;
        setControlPanelHeight(height + 10); // Add small margin
      }
    };

    measureControlPanel();
    // Re-measure on window resize
    window.addEventListener('resize', measureControlPanel);
    return () => window.removeEventListener('resize', measureControlPanel);
  }, [showControls]);

  // Compute panel size (subtract extra space for control panel; here 80px)
  const panelSize = useMemo(() => {
    const columns = layout === '2x2' ? 2 : 3;
    const rows = 2; // Both layouts have 2 rows
    const panelWidth = windowSize.width / columns - 20;
    const panelHeight = (windowSize.height - 80) / rows - 20;
    return { panelWidth, panelHeight };
  }, [layout, windowSize]);

  // Compute panel font size (assume 9 rows: 1 header + 8 competitor rows)
  const panelFontSize = useMemo(() => {
    const numRows = 9;
    return (panelSize.panelHeight / numRows) * (textMultiplier / 100);
  }, [panelSize, textMultiplier]);

  // Full screen table available height (subtract control panel height)
  // Uses measured control panel height for accurate sizing
  const fullScreenAvailableHeight = useMemo(() => {
    // If controls are hidden (web UI), use full height minus small margin
    // If controls are shown, subtract measured control panel height
    const controlHeight = (!isDesktopApp && !showControls) ? 10 : controlPanelHeight;
    return windowSize.height - controlHeight;
  }, [windowSize.height, isDesktopApp, showControls, controlPanelHeight]);

  // Full screen table font size
  const fullScreenFontSize = useMemo(() => {
    const numRows = 9;
    return (fullScreenAvailableHeight / numRows) * (textMultiplier / 100);
  }, [fullScreenAvailableHeight, textMultiplier]);

  // Table cell style: clip text (no ellipsis) and no wrapping
  const tableCellStyle = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'clip',
    padding: '2px',
    margin: 0
  };

  // Fixed row height (same even if row is empty)
  const rowStyle = {
    height: panelSize.panelHeight / 9,
    lineHeight: (panelSize.panelHeight / 9) + 'px',
    overflow: 'hidden'
  };

  // Full screen row style (use available height after control panel)
  const fullScreenRowStyle = {
    height: fullScreenAvailableHeight / 9,
    lineHeight: (fullScreenAvailableHeight / 9) + 'px',
    overflow: 'hidden'
  };

  // Compute column widths (in "ch" units) based on competitor data
  // Columns 1, 2, 5 (Place, ID, Time) flex to fit largest value with no clipping
  // Column 3 (Name) takes remaining space and can clip
  // Column 4 (Affiliation) minimal if empty
  const computeColumnWidthsCh = (competitors) => {
    let col1 = 3, col2 = 4, col3 = 20, col4 = 0, col5 = 5;
    if (competitors && competitors.length > 0) {
      // Col1 (Place): Calculate based on largest place value
      const maxPlace = competitors.reduce((max, comp) => {
        const len = comp.place ? comp.place.length : 1;
        return len > max ? len : max;
      }, 1);
      col1 = maxPlace + 2; // Add 2 for padding

      // Col2 (ID): Calculate based on largest ID value
      const maxId = competitors.reduce((max, comp) => {
        const len = comp.id ? comp.id.length : 1;
        return len > max ? len : max;
      }, 1);
      col2 = Math.max(maxId * 1.5, maxId + 10); // Multiply by 1.5 or add 10, whichever is larger

      // Col5 (Time): Calculate based on largest time value
      const maxTime = competitors.reduce((max, comp) => {
        const len = comp.time ? comp.time.length : 5;
        return len > max ? len : max;
      }, 5);
      col5 = maxTime + 2; // Add 2 for padding

      // Col4 (Affiliation): Only allocate if there are affiliations
      const hasAffiliation = competitors.some(comp => comp.affiliation && comp.affiliation.length > 0);
      if (hasAffiliation) {
        const sumAffiliation = competitors.reduce((sum, comp) => sum + (comp.affiliation ? comp.affiliation.length : 0), 0);
        const avgAffiliation = Math.ceil(sumAffiliation / competitors.length);
        col4 = Math.min(avgAffiliation + 2, 15);
      } else {
        col4 = 0; // No space if no affiliations
      }

      // Col3 (Name): Gets remaining space (will be calculated as percentage)
      // Set to a reasonable default, actual width determined by percentage
      col3 = 20;
    }
    const totalCh = col1 + col2 + col3 + col4 + col5;
    return { col1, col2, col3, col4, col5, totalCh };
  };

  // Compute displayed competitors for full screen mode with rotation
  const displayedCompetitors = useMemo(() => {
    if (!currentLIF || !currentLIF.competitors) {
      return Array(8).fill({ place: "", id: "", firstName: "", lastName: "", affiliation: "", time: "" });
    }

    const comps = currentLIF.competitors;

    if (comps.length <= 8) {
      // Return all with padding
      const result = comps.slice(0, 8);
      while (result.length < 8) {
        result.push({ place: "", id: "", firstName: "", lastName: "", affiliation: "", time: "" });
      }
      return result;
    }

    // Apply rotation mode from desktop
    if (rotationMode === 'scroll') {
      // Top 3 locked, remaining 5 scroll
      const fixed = comps.slice(0, 3);
      const rotating = comps.slice(3);
      const windowSize = 5;
      let rollingDisplayed = rotating.slice(fullScreenRotateIndex, fullScreenRotateIndex + windowSize);
      if (rollingDisplayed.length < windowSize) {
        const needed = windowSize - rollingDisplayed.length;
        rollingDisplayed = rollingDisplayed.concat(rotating.slice(0, needed));
      }
      while (rollingDisplayed.length < windowSize) {
        rollingDisplayed.push({ place: "", id: "", firstName: "", lastName: "", affiliation: "", time: "" });
      }
      return fixed.concat(rollingDisplayed);
    } else if (rotationMode === 'page') {
      // 8 per page
      const pageSize = 8;
      const startIndex = fullScreenRotateIndex * pageSize;
      const result = comps.slice(startIndex, startIndex + pageSize);
      while (result.length < 8) {
        result.push({ place: "", id: "", firstName: "", lastName: "", affiliation: "", time: "" });
      }
      return result;
    } else if (rotationMode === 'scrollAll') {
      // All 8 scroll
      const windowSize = 8;
      let result = comps.slice(fullScreenRotateIndex, fullScreenRotateIndex + windowSize);
      if (result.length < windowSize) {
        const needed = windowSize - result.length;
        result = result.concat(comps.slice(0, needed));
      }
      while (result.length < 8) {
        result.push({ place: "", id: "", firstName: "", lastName: "", affiliation: "", time: "" });
      }
      return result;
    }
  }, [currentLIF, fullScreenRotateIndex, rotationMode]);

  // Track current event name to detect when event changes (not just data refresh)
  const currentEventName = currentLIF?.eventName || '';

  // Reset rotation index when event changes or rotation mode changes
  useEffect(() => {
    setFullScreenRotateIndex(0);
  }, [currentEventName, rotationMode]);

  // Rotation effect for full screen mode
  useEffect(() => {
    if (viewMode === 'fullscreen' && currentLIF && currentLIF.competitors && currentLIF.competitors.length > 8) {
      const totalCompetitors = currentLIF.competitors.length;
      let maxIndex = 0;

      if (rotationMode === 'scroll') {
        const rotatingCount = totalCompetitors - 3;
        const windowSize = 5;
        maxIndex = rotatingCount - windowSize;
      } else if (rotationMode === 'page') {
        const totalPages = Math.ceil(totalCompetitors / 8);
        maxIndex = totalPages - 1;
      } else if (rotationMode === 'scrollAll') {
        maxIndex = totalCompetitors - 1;
      }

      const intervalId = setInterval(() => {
        setFullScreenRotateIndex(prevIndex => {
          const nextIndex = prevIndex + 1;
          return nextIndex > maxIndex ? 0 : nextIndex;
        });
      }, 5000);

      return () => clearInterval(intervalId);
    }
  }, [viewMode, rotationMode]);

  // Panel component: displays a grid-based table with 1 header row and 8 competitor rows.
  // CSS Grid ensures all 9 rows fit perfectly with no clipping
  const Panel = ({ data, panelFontSize, panelSize }) => {
    const competitors = data.competitors || [];
    const displayedCompetitors = competitors.length >= 8
      ? competitors.slice(0, 8)
      : [...competitors, ...Array(8 - competitors.length).fill({ place: "", id: "", firstName: "", lastName: "", affiliation: "", time: "" })];
    const colWidths = computeColumnWidthsCh(displayedCompetitors);
    const hasAffiliation = colWidths.col4 > 0;

    // Use minmax(min-content, auto) to guarantee columns never shrink below content width
    const gridContainerStyle = {
      width: panelSize.panelWidth,
      height: panelSize.panelHeight,
      backgroundColor: '#000',
      border: '1px solid #555',
      overflowX: 'auto', // Allow horizontal scroll if content is too wide
      overflowY: 'hidden',
      display: 'grid',
      gridTemplateRows: 'repeat(9, 1fr)', // 9 equal rows (1 header + 8 competitors)
      gridTemplateColumns: hasAffiliation
        ? `minmax(min-content, auto) minmax(min-content, auto) 1fr minmax(${colWidths.col4}ch, auto) minmax(min-content, auto)`
        : `minmax(min-content, auto) minmax(min-content, auto) 1fr minmax(min-content, auto)`,
      color: 'white',
      fontSize: panelFontSize + 'px'
    };

    const cellStyle = {
      padding: '2px 4px',
      overflow: 'hidden',
      textOverflow: 'clip',
      whiteSpace: 'nowrap',
      display: 'flex',
      alignItems: 'center'
    };

    return (
      <div style={gridContainerStyle}>
        {/* Header row - spans all columns except last for event name */}
        <div style={{ ...cellStyle, backgroundColor: '#003366', fontWeight: 'bold', gridColumn: hasAffiliation ? '1 / 5' : '1 / 4' }}>
          {data.eventName}
        </div>
        {/* Header row - last column for wind */}
        <div style={{ ...cellStyle, backgroundColor: '#003366', fontWeight: 'bold', justifyContent: 'flex-end' }}>
          {data.wind}
        </div>

        {/* Competitor rows */}
        {displayedCompetitors.map((comp, idx) => {
          const bgColor = idx % 2 === 0 ? '#191970' : '#4682B4';
          return (
            <React.Fragment key={idx}>
              <div style={{ ...cellStyle, backgroundColor: bgColor, fontWeight: 'bold', borderRight: '1px solid #666' }}>{comp.place}</div>
              <div style={{ padding: '2px 4px', whiteSpace: 'nowrap', backgroundColor: bgColor }}>{comp.id}</div>
              <div style={{ ...cellStyle, backgroundColor: bgColor }}>
                {(comp.firstName ? comp.firstName + " " : "") + (comp.lastName || "")}
              </div>
              {hasAffiliation && <div style={{ ...cellStyle, backgroundColor: bgColor }}>{comp.affiliation}</div>}
              <div style={{ padding: '2px 4px', whiteSpace: 'nowrap', backgroundColor: bgColor, textAlign: 'right' }}>{comp.time}</div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // Full screen table component - matches desktop App.jsx expanded display exactly
  const FullScreenTable = () => {
    const containerStyle = {
      width: '100vw',
      height: fullScreenAvailableHeight + 'px',
      backgroundColor: '#000',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 5
    };

    // Show text display if active (matches App.jsx)
    if (syncedDisplayMode === 'text' && syncedActiveText) {
      return (
        <div style={{
          ...containerStyle,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: 'white',
          fontSize: '3rem',
          textAlign: 'center',
          padding: '20px',
          whiteSpace: 'pre-line'
        }}>
          {syncedActiveText}
        </div>
      );
    }

    // Show screensaver if active (matches App.jsx)
    if (syncedDisplayMode === 'screensaver' && syncedImageBase64) {
      return (
        <div style={containerStyle}>
          <img
            src={syncedImageBase64}
            alt="Screensaver"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
          />
        </div>
      );
    }

    // Default: show LIF table (matches App.jsx)
    if (!currentLIF || !currentLIF.competitors || currentLIF.competitors.length === 0) {
      return (
        <div style={{ ...containerStyle, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white' }}>
          <h2>No event data available</h2>
        </div>
      );
    }

    const colWidths = computeColumnWidthsCh(displayedCompetitors);
    const hasAffiliation = colWidths.col4 > 0;

    // Use minmax(min-content, auto) to guarantee columns never shrink below content width
    const gridStyle = {
      ...containerStyle,
      display: 'grid',
      gridTemplateRows: 'repeat(9, 1fr)', // 9 equal rows (1 header + 8 competitors)
      gridTemplateColumns: hasAffiliation
        ? `minmax(min-content, auto) minmax(min-content, auto) 1fr minmax(${colWidths.col4}ch, auto) minmax(min-content, auto)`
        : `minmax(min-content, auto) minmax(min-content, auto) 1fr minmax(min-content, auto)`,
      color: 'white',
      fontSize: fullScreenFontSize + 'px',
      overflowX: 'auto' // Allow horizontal scroll if content is too wide
    };

    const cellStyle = {
      padding: '2px 4px',
      overflow: 'hidden',
      textOverflow: 'clip',
      whiteSpace: 'nowrap',
      display: 'flex',
      alignItems: 'center'
    };

    return (
      <div style={gridStyle}>
        {/* Header row - spans columns for event name (all but last column) */}
        <div style={{ ...cellStyle, backgroundColor: '#003366', fontWeight: 'bold', gridColumn: hasAffiliation ? '1 / 5' : '1 / 4' }}>
          {currentLIF.eventName}
        </div>
        {/* Header row - last column for wind */}
        <div style={{ ...cellStyle, backgroundColor: '#003366', fontWeight: 'bold', justifyContent: 'flex-end' }}>
          {currentLIF.wind}
        </div>

        {/* Competitor rows */}
        {displayedCompetitors.map((comp, idx) => {
          const bgColor = idx % 2 === 0 ? '#191970' : '#4682B4';
          // Add border after row 2 in scroll mode to indicate locked top 3
          const showBorder = currentLIF && currentLIF.competitors.length > 8 && idx === 2 && rotationMode === 'scroll';
          const borderStyle = showBorder ? '3px solid black' : 'none';

          return (
            <React.Fragment key={idx}>
              <div style={{ ...cellStyle, backgroundColor: bgColor, borderBottom: borderStyle, fontWeight: 'bold', borderRight: '1px solid #666' }}>{comp.place}</div>
              <div style={{ padding: '2px 4px', whiteSpace: 'nowrap', backgroundColor: bgColor, borderBottom: borderStyle }}>{comp.id}</div>
              <div style={{ ...cellStyle, backgroundColor: bgColor, borderBottom: borderStyle }}>
                {(comp.firstName ? comp.firstName + " " : "") + (comp.lastName || "")}
              </div>
              {hasAffiliation && <div style={{ ...cellStyle, backgroundColor: bgColor, borderBottom: borderStyle }}>{comp.affiliation}</div>}
              <div style={{ padding: '2px 4px', whiteSpace: 'nowrap', backgroundColor: bgColor, borderBottom: borderStyle, textAlign: 'right' }}>{comp.time}</div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // Grid container style for panels, reserving extra bottom margin so panels aren't covered.
  const gridContainerStyle = {
    display: 'grid',
    gridTemplateColumns: layout === '2x2' ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
    gap: '10px',
    marginBottom: '100px'
  };

  // Calculate page info for display
  const totalPages = lifDataArray.length > gridCount ? Math.ceil(lifDataArray.length / gridCount) : 1;
  const currentPage = lifDataArray.length > gridCount ? (rotateIndex % totalPages) + 1 : 1;
  const pageInfo = displayMode === 'rotate' && lifDataArray.length > gridCount
    ? ` - Page ${currentPage} of ${totalPages}`
    : '';

  return (
    <div style={{ padding: viewMode === 'fullscreen' ? '0' : '20px', backgroundColor: '#222', minHeight: '100vh', color: 'white', position: 'relative', overflow: 'hidden' }}>
      {viewMode === 'multi' && <h2 style={{ textAlign: 'center' }}>Results{pageInfo}</h2>}

      {/* Multi-grid view */}
      {viewMode === 'multi' && (
        <div style={gridContainerStyle}>
          {displayedLIFs.map((lif, idx) => (
            <Panel key={idx} data={lif} panelFontSize={panelFontSize} panelSize={panelSize} />
          ))}
        </div>
      )}

      {/* Full screen table view */}
      {viewMode === 'fullscreen' && <FullScreenTable />}

      {/* Fixed control panel positioned just above the bottom */}
      {/* Desktop: always show if not full screen. Web: show only if showControls is true */}
      {!isFullScreen && (isDesktopApp || showControls) && (
        <div ref={controlPanelRef} className="fixed-bottom bg-dark text-white py-2" style={{ opacity: 0.95 }}>
          <div className="container-fluid">
            <div className="d-flex justify-content-around align-items-center flex-wrap">

              {/* Back Button (always visible) */}
              <div>
                <button className="btn btn-primary mx-1" onClick={() => navigate("/")}>Back</button>
              </div>

              {/* Desktop-only controls */}
              {isDesktopApp && (
                <>
                  {/* Directory Selection */}
                  <div>
                    <button className="btn btn-primary mx-1" onClick={chooseDirectory}>Select Results Directory</button>
                    {error && <span className="text-danger ml-2">{error}</span>}
                    {selectedDir && <span className="text-muted ml-2">{selectedDir}</span>}
                  </div>
                  {/* Full Screen Button */}
                  <div>
                    <button className="btn btn-primary mx-1" onClick={toggleFullScreen}>Full Screen</button>
                  </div>
                </>
              )}

              {/* View Mode Toggle (web only) */}
              {!isDesktopApp && (
                <div className="d-flex align-items-center">
                  <span className="mr-1">View:</span>
                  <button
                    className={`btn mx-1 ${viewMode === 'multi' ? 'btn-success' : 'btn-secondary'}`}
                    onClick={() => setViewMode('multi')}
                  >
                    Multi Grid
                  </button>
                  <button
                    className={`btn mx-1 ${viewMode === 'fullscreen' ? 'btn-success' : 'btn-secondary'}`}
                    onClick={() => setViewMode('fullscreen')}
                  >
                    Full Screen Table
                  </button>
                </div>
              )}

              {/* Layout Controls (both desktop and web) */}
              <div className="d-flex align-items-center">
                <span className="mr-1">Layout:</span>
                <button className="btn btn-primary mx-1" onClick={() => setLayout('2x2')}>2x2</button>
                <button className="btn btn-primary mx-1" onClick={() => setLayout('3x2')}>3x2</button>
              </div>

              {/* Mode Controls (both desktop and web) */}
              <div className="d-flex align-items-center">
                <span className="mr-1">Mode:</span>
                <button className="btn btn-primary mx-1" onClick={() => setDisplayMode('rotate')}>Rotate</button>
                <button className="btn btn-primary mx-1" onClick={() => setDisplayMode('latest')}>Latest</button>
              </div>

              {/* Text Size Controls (both desktop and web) */}
              <div className="d-flex align-items-center">
                <span className="mr-1">Text:</span>
                <button className="btn btn-primary mx-1" onClick={decrementTextMultiplier}>Smaller</button>
                <button className="btn btn-primary mx-1" onClick={incrementTextMultiplier}>Larger</button>
                <span className="ml-2">{textMultiplier}%</span>
              </div>

              {/* Version Info */}
              <div>
                <small className="text-muted">Version 2.0.2 - Gordon Lester - web@kingstonandpoly.org</small>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Results;
