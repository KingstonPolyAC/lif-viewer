import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GetAllLIFData, ChooseDirectory, EnterFullScreen, ExitFullScreen, GetWebInterfaceInfo } from '../wailsjs/go/main/App';

function Results() {
  const navigate = useNavigate();

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

  // Fetch LIF data every 3 seconds using HTTP endpoint (works for both local and remote access)
  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/all-lif');
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

  // Text size adjustment functions
  const incrementTextMultiplier = () => setTextMultiplier(prev => Math.min(prev + 5, 200));
  const decrementTextMultiplier = () => setTextMultiplier(prev => Math.max(prev - 5, 5));

  // Directory selection function
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

  // Grid count based on layout (2x2 = 4 panels; 3x2 = 6 panels)
  const gridCount = useMemo(() => (layout === '2x2' ? 4 : 6), [layout]);

  // Determine displayed LIFs based on mode:
  // - In Rotate mode, cycle groups of gridCount items every 5 seconds.
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
        const rotated = [];
        for (let i = 0; i < gridCount; i++) {
          rotated.push(lifDataArray[(rotateIndex + i) % lifDataArray.length]);
        }
        return rotated;
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

  // In Rotate mode, cycle through all available LIFs every 5 seconds.
  useEffect(() => {
    if (displayMode === 'rotate' && lifDataArray.length > gridCount) {
      const intervalId = setInterval(() => {
        setRotateIndex(prev => (prev + gridCount) % lifDataArray.length);
      }, 5000);
      return () => clearInterval(intervalId);
    }
  }, [displayMode, lifDataArray, gridCount]);

  // Track window size for responsive layout
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Compute column widths (in "ch" units) based on competitor data
  const computeColumnWidthsCh = (competitors) => {
    let col1 = 3, col2 = 4, col3 = 5, col4 = 5, col5 = 5;
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
      if (col3 <= col4) { col3 = col4 + 1; }
    }
    const totalCh = col1 + col2 + col3 + col4 + col5;
    return { col1, col2, col3, col4, col5, totalCh };
  };

  // Panel component: displays a table with 1 header row and 8 competitor rows.
  const Panel = ({ data, panelFontSize, panelSize }) => {
    const competitors = data.competitors || [];
    const displayedCompetitors = competitors.length >= 8
      ? competitors.slice(0, 8)
      : [...competitors, ...Array(8 - competitors.length).fill({ place: "", id: "", firstName: "", lastName: "", affiliation: "", time: "" })];
    const colWidths = computeColumnWidthsCh(displayedCompetitors);
    const totalCh = colWidths.totalCh;
    const colPercentages = {
      w1: (colWidths.col1 / totalCh) * 100 + '%',
      w2: (colWidths.col2 / totalCh) * 100 + '%',
      w3: (colWidths.col3 / totalCh) * 100 + '%',
      w4: (colWidths.col4 / totalCh) * 100 + '%',
      w5: (colWidths.col5 / totalCh) * 100 + '%'
    };

    return (
      <div style={{
        width: panelSize.panelWidth,
        height: panelSize.panelHeight,
        backgroundColor: '#000',
        border: '1px solid #555',
        overflow: 'hidden'
      }}>
        <table style={{
          width: '100%',
          height: '100%',
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          color: 'white',
          fontSize: panelFontSize + 'px'
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
              <th colSpan="4" style={{ ...tableCellStyle, textAlign: 'left' }}>{data.eventName}</th>
              <th style={{ ...tableCellStyle, textAlign: 'right', paddingRight: '1ch', overflow: 'visible' }}>{data.wind}</th>
            </tr>
          </thead>
          <tbody>
            {displayedCompetitors.map((comp, idx) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#191970' : '#4682B4', ...rowStyle }}>
                <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.place}</td>
                <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.id}</td>
                <td style={{ ...tableCellStyle, textAlign: 'left' }}>
                  {(comp.firstName ? comp.firstName + " " : "") + (comp.lastName || "")}
                </td>
                <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.affiliation}</td>
                <td style={{ ...tableCellStyle, textAlign: 'right', paddingRight: '1ch' }}>{comp.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Grid container style for panels, reserving extra bottom margin so panels aren’t covered.
  const gridContainerStyle = {
    display: 'grid',
    gridTemplateColumns: layout === '2x2' ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
    gap: '10px',
    marginBottom: '100px'
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#222', height: '100vh', color: 'white', position: 'relative', overflow: 'hidden' }}>
      <h2 style={{ textAlign: 'center' }}>Results</h2>
      {/* Grid of Panels */}
      <div style={gridContainerStyle}>
        {displayedLIFs.map((lif, idx) => (
          <Panel key={idx} data={lif} panelFontSize={panelFontSize} panelSize={panelSize} />
        ))}
      </div>
      {/* Fixed control panel positioned just above the bottom */}
      {!isFullScreen && (
        <div className="fixed-bottom bg-dark text-white py-2" style={{ opacity: 0.95 }}>
          <div className="container-fluid">
            <div className="d-flex justify-content-around align-items-center flex-wrap">
              {/* Back Button */}
              <div>
                <button className="btn btn-primary mx-1" onClick={() => navigate("/")}>Back</button>
              </div>
              {/* Directory Selection */}
              <div>
                <button className="btn btn-primary mx-1" onClick={chooseDirectory}>Select Results Directory</button>
                {error && <span className="text-danger ml-2">{error}</span>}
                {selectedDir && <span className="text-muted ml-2">{selectedDir}</span>}
              </div>
              {/* Layout Controls */}
              <div className="d-flex align-items-center">
                <span className="mr-1">Layout:</span>
                <button className="btn btn-primary mx-1" onClick={() => setLayout('2x2')}>2x2</button>
                <button className="btn btn-primary mx-1" onClick={() => setLayout('3x2')}>3x2</button>
              </div>
              {/* Mode Controls */}
              <div className="d-flex align-items-center">
                <span className="mr-1">Mode:</span>
                <button className="btn btn-primary mx-1" onClick={() => setDisplayMode('rotate')}>Rotate</button>
                <button className="btn btn-primary mx-1" onClick={() => setDisplayMode('latest')}>Latest</button>
              </div>
              {/* Text Size Controls */}
              <div className="d-flex align-items-center">
                <span className="mr-1">Text:</span>
                <button className="btn btn-primary mx-1" onClick={decrementTextMultiplier}>Smaller</button>
                <button className="btn btn-primary mx-1" onClick={incrementTextMultiplier}>Larger</button>
                <span className="ml-2">{textMultiplier}%</span>
              </div>
              {/* Full Screen Button */}
              <div>
                <button className="btn btn-primary mx-1" onClick={toggleFullScreen}>Full Screen</button>
              </div>
              {/* Version Info */}
              <div>
                <small className="text-muted">Version 1.3 - Gordon Lester - web@kingstonandpoly.org</small>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Results;
