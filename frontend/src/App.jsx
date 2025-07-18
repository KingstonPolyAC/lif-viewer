import React, { useState, useEffect, useMemo } from 'react';
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

// Section style for each control panel section.
const sectionStyle = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '5px',
  paddingBottom: '5px',
  borderBottom: '1px solid white'
};

// Last section: remove bottom border.
const sectionStyleLast = {
  ...sectionStyle,
  borderBottom: 'none'
};

// Section label style.
const sectionLabelStyle = {
  fontWeight: 'bold',
  padding: '2px 4px',
  color: 'white',
  margin: 0
};

// Control Panel Title style.
const controlPanelTitleStyle = {
  fontWeight: 'bold',
  padding: '2px 4px',
  color: 'white',
  margin: 0,
  textDecoration: 'underline',
  marginBottom: '10px'
};

// Button style for the control panel.
const controlButtonStyle = {
  fontSize: '16px',
  padding: '10px 20px',
  backgroundColor: 'black',
  color: 'white',
  border: '1px solid white',
  cursor: 'pointer'
};

// Existing button style for non-panel buttons.
const buttonStyle = {
  fontSize: '16px',
  padding: '10px 20px',
  border: '2px solid white',
  borderRadius: '5px',
  backgroundColor: 'navy',
  color: 'white',
  cursor: 'pointer'
};

// Text field style for control panel texts.
const textFieldStyle = {
  padding: '2px 4px',
  color: 'white',
  backgroundColor: 'black'
};

// Table cell style: fixed layout, no wrapping, clipped overflow.
const tableCellStyle = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'clip',
  padding: '0px',
  margin: '0px'
};

/*
  Compute column widths in "ch" units for five columns:
  - Column 1: Fixed 3 ch (Place)
  - Column 2: Fixed 4 ch (ID)
  - Column 3: Competitor Name – maximum length of (firstName + " " + lastName) + 1.
  - Column 4: Affiliation – average length + 1, capped at 12.
  - Column 5: Time – maximum length + 1, capped at 12.
  (Ensure the name column is always at least one character wider than the affiliation column.)
*/
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

// New style for the screensaver image to ensure it fits while maintaining its aspect ratio.
const screensaverImageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  position: 'absolute',
  top: 0,
  left: 0,
};

function App() {
  const [lifData, setLifData] = useState(null);
  const [error, setError] = useState('');
  const [selectedDir, setSelectedDir] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rotationIndex, setRotationIndex] = useState(0);
  const [expandedTable, setExpandedTable] = useState(false);
  const [appFullScreen, setAppFullScreen] = useState(false);
  const [webInterfaceInfo, setWebInterfaceInfo] = useState("");
  const navigate = useNavigate();

  // Default text multiplier set to 60% (text occupies 60% of each row's height).
  const [textMultiplier, setTextMultiplier] = useState(60);
  const incrementTextMultiplier = () => setTextMultiplier(prev => Math.min(prev + 5, 200));
  const decrementTextMultiplier = () => setTextMultiplier(prev => Math.max(prev - 5, 5));

  // NEW STATE FOR IMAGE CONTROLS
  const [linkedImage, setLinkedImage] = useState(null);
  const [screensaverActive, setScreensaverActive] = useState(false);
  // NEW: Keep track of the previous lifData for comparison
  
  const [inputText, setInputText] = useState("");
  const [prevLifData, setPrevLifData] = useState(null);
  const [activeText, setActiveText] = useState("");

  // Compute displayed competitors.
  const displayedCompetitors = useMemo(() => {
    const comps = (lifData && lifData.competitors) || [];
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
  }, [lifData, rotationIndex]);

  // Track window size.
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : DEFAULT_TABLE_WIDTH,
    height: typeof window !== 'undefined' ? window.innerHeight : DEFAULT_TABLE_HEIGHT,
  });
  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Data fetching.
  const fetchLatestData = async () => {
    try {
      const response = await fetch("http://127.0.0.1:3000/latest-lif");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.Status}`);
      const data = await response.json();
      setError('');
      setLifData(Object.keys(data).length === 0 ? null : data);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Error fetching latest data.');
    }
  };
  useEffect(() => {
    fetchLatestData();
    const interval = setInterval(fetchLatestData, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fetch web interface info.
  useEffect(() => {
    async function fetchWebInterfaceInfo() {
      try {
        const info = await GetWebInterfaceInfo();
        setWebInterfaceInfo(info);
      } catch (error) {
        console.error("Error fetching web interface info", error);
      }
    }
    fetchWebInterfaceInfo();
  }, []);

  // Rotation: if more than 8 competitors, rotate (lock first 3; rotate remaining 5).
  useEffect(() => {
    if (lifData && lifData.competitors && lifData.competitors.length > 8) {
      const rotatingCount = lifData.competitors.length - 3;
      const windowSize = 5;
      const maxIndex = rotatingCount - windowSize;
      const intervalId = setInterval(() => {
        setRotationIndex(prevIndex => (prevIndex >= maxIndex ? 0 : prevIndex + 1));
      }, 5000);
      return () => clearInterval(intervalId);
    }
  }, [lifData && lifData.competitors ? lifData.competitors.length : 0]);

  // Listen for Escape ONLY (removed Space) to exit full screen modes.
  useEffect(() => {
    if (expandedTable || appFullScreen) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          if (expandedTable) setExpandedTable(false);
          if (appFullScreen) {
            ExitFullScreen();
            setAppFullScreen(false);
          }
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [expandedTable, appFullScreen]);

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

  const toggleAppFullScreen = () => {
    if (appFullScreen) {
      ExitFullScreen();
      setAppFullScreen(false);
    } else {
      EnterFullScreen();
      setAppFullScreen(true);
    }
  };

  // Fallback display if no LIF data.
  const tableFallback = (
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
  const expandedFallback = (
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

  // When a new LIF file is detected or when the current lif file is updated,
  // disable screensaver mode and clear active text display.
  useEffect(() => {
    if (lifData) {
      const lifDataString = JSON.stringify(lifData);
      if (prevLifData === null) {
        setPrevLifData(lifDataString);
      } else if (prevLifData !== lifDataString) {
        console.log("New LIF data detected, clearing overlays");
        setPrevLifData(lifDataString);
        // New LIF data takes priority - clear screensaver and text display
        setScreensaverActive(false);
        setActiveText("");
      }
    }
  }, [lifData]);

  // Function to handle linking a PNG image.
  const handleLinkImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const imgUrl = URL.createObjectURL(file);
        setLinkedImage(imgUrl);
        console.log('Linked image set:', imgUrl);
      }
    };
    input.click();
  };

  // Function to activate screensaver mode.
  const handleScreensaver = () => {
    if (!linkedImage) {
      alert('Please link a PNG image first.');
      return;
    }
    setScreensaverActive(true);
  };

  // Determine what to display in the top left (minimised display area).
  // When expandedTable is active, we return null so that only the expanded view is shown.
  const renderTopLeftDisplay = () => {
    if (expandedTable) return null;
    if (screensaverActive) {
      return (
        <div style={{ ...defaultTableContainerStyle, position: 'absolute', top: '2px', left: '2px', backgroundColor: '#000' }}>
          <img src={linkedImage} alt="Screensaver" style={screensaverImageStyle} />
        </div>
      );
    }
    if (!lifData || !lifData.competitors || lifData.competitors.length === 0) {
      return tableFallback;
    } else {
      return (
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
                <th colSpan="4" style={headerEventNameStyle}>{lifData.eventName}</th>
                <th style={{ ...tableCellStyle, textAlign: 'right', paddingRight: '1ch' }}>{lifData.wind}</th>
              </tr>
            </thead>
            <tbody>
              {displayedCompetitors.map((comp, index) => {
                const competitorRowStyle = { ...rowStyle };
                if (lifData && lifData.competitors.length > 8 && index === 2) {
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
    }
  };

  return (
    <div style={containerStyle}>
      {/* Background image */}
      <img src={welcomeImage} alt="Welcome" style={backgroundImageStyle} />

      {/* Top Left Display: either competitor table or screensaver (not rendered if expanded table is active) */}
      {renderTopLeftDisplay()}

      {/* Expanded Table Display */}
      {expandedTable && (
        lifData && lifData.competitors && lifData.competitors.length > 0 ? (
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
                  <th colSpan="4" style={headerEventNameStyle}>{lifData.eventName}</th>
                  <th style={{ ...tableCellStyle, textAlign: 'right', paddingRight: '1ch' }}>{lifData.wind}</th>
                </tr>
              </thead>
              <tbody>
                {displayedCompetitors.map((comp, index) => {
                  const competitorRowStyle = { ...rowStyle };
                  if (lifData && lifData.competitors.length > 8 && index === 2) {
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
            <div style={textFieldStyle}>Press Esc to exit expanded table mode.</div>
            <div style={textFieldStyle}>Version 1.3.3 - Gordon Lester - web@kingstonandpoly.org</div>
          </div>
        ) : (
          expandedFallback
        )
      )}

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
          <div className="mb-3 pb-3 border-bottom">
            <div className="row g-2">
              <div className="col">
                <button className="btn btn-primary w-100" onClick={handleLinkImage}>
                  Link Image
                </button>
              </div>
              <div className="col">
                <button className="btn btn-primary w-100" onClick={handleScreensaver}>
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
          Version 1.3.6 - Gordon Lester - web@kingstonandpoly.org
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
        alignItems: 'center'
      }}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Enter display text..."
          style={{
            padding: '10px',
            fontSize: '1rem',
            backgroundColor: '#111',
            color: 'white',
            border: '1px solid white',
            borderRadius: '4px',
            width: '300px'
          }}
        />
        <button
          className="btn btn-primary"
          onClick={() => setActiveText(inputText)}
        >
          Display Text
        </button>
      </div>

{/* Display Text Overlay */}
{activeText && !expandedTable && (
  <div style={{
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '384px',
    height: '192px',
    backgroundColor: 'black',
    color: 'white',
    zIndex: 6,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '1.8rem',
    textAlign: 'center',
    padding: '10px'
  }}>
    {activeText}
  </div>
)}
</div>
  );
}

export default App;