import React, { useState, useEffect } from 'react';
import { ChooseDirectory, EnterFullScreen, ExitFullScreen, GetWebInterfaceInfo } from "../wailsjs/go/main/App";
import welcomeImage from './welcome.png'; // Ensure this path is correct

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

// Background image, centered behind everything.
const backgroundImageStyle = {
  position: 'absolute',
  top: '50px',
  right: '50px',
  height: '150px',
  width: '150px',
  zIndex: 0,
};

// Default table container: fixed size at 384x192px, flush at top left.
const defaultTableContainerStyle = {
  width: `${DEFAULT_TABLE_WIDTH}px`,
  height: `${DEFAULT_TABLE_HEIGHT}px`,
  backgroundColor: '#000',
  position: 'absolute',
  top: '0px',
  left: '0px',
  zIndex: 2,
  overflow: 'hidden',
};

// Expanded table container: fills 100% of the app window.
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

// Container for title and directory selection (top right, vertically centered).
const topRightStyle = {
  position: 'absolute',
  top: '50%',
  right: '20px',
  transform: 'translateY(-50%)',
  zIndex: 3,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: '10px',
};

// Container for the full screen toggle buttons and help text (bottom right, always visible).
const fullScreenButtonStyle = {
  position: 'absolute',
  bottom: '20px',
  right: '20px',
  zIndex: 3,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: '10px',
};

const buttonStyle = {
  fontSize: '16px',
  padding: '10px 20px',
  border: '2px solid navy',
  backgroundColor: 'navy',
  color: 'white',
  cursor: 'pointer'
};

const helpTextStyle = {
  color: 'white',
  fontSize: '16px',
  textAlign: 'center',
  width: '100%'
};

// Table cell style: fixed layout, no wrapping, clip overflow.
// Removed padding to avoid extra height.
const tableCellStyle = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'clip',
  padding: '0px',
  margin: '0px'
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


  // Constant: maximum rotating rows (beyond fixed first 3).
  const MAX_ROTATING = 5;

  // For default mode, force total row count to 9 (1 header + 8 competitor rows) if there are 8 or more competitors.
  const defaultNumCompetitorRows =
    lifData && lifData.competitors && lifData.competitors.length >= 8
      ? 8
      : (lifData && lifData.competitors ? lifData.competitors.length : 8);
  const defaultNumRows = 1 + defaultNumCompetitorRows; // header + competitor rows
  // Compute fixed row height for default mode.
  const defaultRowHeight = DEFAULT_TABLE_HEIGHT / defaultNumRows;
  // Compute default font size (e.g., 78% of row height).
  const computedDefaultFontSize = defaultRowHeight * 0.78;

  // For expanded mode, compute font size dynamically using full window height.
  const expandedNumRows = lifData && lifData.competitors ? lifData.competitors.length + 1 : 9;
  const computedExpandedFontSize = (window.innerHeight / expandedNumRows) * 0.8;

  // Choose table container style based on mode.
  const currentTableStyle = expandedTable
    ? { ...expandedTableContainerStyle, fontSize: computedExpandedFontSize + 'px' }
    : { ...defaultTableContainerStyle, fontSize: computedDefaultFontSize + 'px' };

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

  const fetchLatestData = async () => {
    try {
      const response = await fetch("http://127.0.0.1:3000/latest-lif");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setError('');
      if (Object.keys(data).length === 0) {
        setLifData(null);
      } else {
        setLifData(data);
      }
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

  // Rotation: if there are more than 8 competitors, update rotationIndex every 5 seconds.
  useEffect(() => {
    if (lifData && lifData.competitors && lifData.competitors.length > 8) {
      const rotatingCount = lifData.competitors.length - 3; // competitors available for rolling
      const windowSize = 5;
      const maxIndex = rotatingCount - windowSize; // last valid starting index for the 5-row window
      const intervalId = setInterval(() => {
        setRotationIndex(prevIndex => (prevIndex >= maxIndex ? 0 : prevIndex + 1));
      }, 5000);
      return () => clearInterval(intervalId);
    }
  }, [lifData && lifData.competitors ? lifData.competitors.length : 0]);

  // Listen for Escape or Space to exit expanded table and app full screen modes.
  useEffect(() => {
    if (expandedTable || appFullScreen) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape' || e.key === ' ') {
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

  // Compute displayed competitors:
  // If total competitors <= 8, show them all.
  // Else, fix the first 3 rows and rotate through the remaining competitors.
  let displayedCompetitors = [];
  if (lifData && lifData.competitors) {
    const comps = lifData.competitors;
    if (comps.length <= 8) {
      displayedCompetitors = comps;
    } else {
      // Lock the first 3 competitors
      const fixed = comps.slice(0, 3);
      // Create a rolling window from the remaining competitors
      const rotating = comps.slice(3);
      const windowSize = 5; // because 8 total rows - 3 fixed = 5 rolling rows
      const startIndex = rotationIndex; // controlled by the useEffect below
      const rollingDisplayed = rotating.slice(startIndex, startIndex + windowSize);
      displayedCompetitors = fixed.concat(rollingDisplayed);
    }
  }
  
  // App full screen toggle: single button.
  const toggleAppFullScreen = () => {
    if (appFullScreen) {
      ExitFullScreen();
      setAppFullScreen(false);
    } else {
      EnterFullScreen();
      setAppFullScreen(true);
    }
  };

  return (
    <div style={containerStyle}>
      {/* Background image */}
      <img src={welcomeImage} alt="Welcome" style={backgroundImageStyle} />

      {/* Top right: Title and directory selection */}
      <div style={topRightStyle}>
        <button onClick={chooseDirectory} style={buttonStyle}>Select Directory</button>
        {selectedDir && <p style={{ margin: 0 }}>Current Directory: {selectedDir}</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {isLoading && <p>Loading...</p>}
        <p>{webInterfaceInfo}</p>
      </div>

      {/* Default Table Mode (fixed size, top left) */}
      {lifData && lifData.competitors && !expandedTable && (
        <div style={currentTableStyle}>
          <table
            style={{
              width: '100%',
              height: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              color: 'white',
            }}
          >
            <colgroup>
              <col style={{ width: '9%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '45%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#003366', fontWeight: 'bold', height: `${defaultRowHeight}px` }}>
                <th colSpan="4" style={{ ...tableCellStyle, textAlign: 'left' }}>
                  {lifData.eventName}
                </th>
                <th style={{ ...tableCellStyle, textAlign: 'right' }}>
                  {lifData.wind}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedCompetitors.map((comp, index) => (
                <tr
                  key={index}
                  style={{
                    backgroundColor: index % 2 === 0 ? '#191970' : '#4682B4',
                    height: `${defaultRowHeight}px`
                  }}
                >
                  <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.place}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.id}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.lastName}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.affiliation}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'right' }}>{comp.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Expanded Table Mode: fills 100% of the app window */}
      {expandedTable && lifData && lifData.competitors && (
        <div style={currentTableStyle}>
          <table
            style={{
              width: '100%',
              height: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              color: 'white',
            }}
          >
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '43%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '19%' }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#003366', fontWeight: 'bold' }}>
                <th colSpan="4" style={{ ...tableCellStyle, textAlign: 'left' }}>
                  {lifData.eventName}
                </th>
                <th style={{ ...tableCellStyle, textAlign: 'right' }}>
                  {lifData.wind}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedCompetitors.map((comp, index) => (
                <tr
                  key={index}
                  style={{
                    backgroundColor: index % 2 === 0 ? '#191970' : '#4682B4'
                  }}
                >
                  <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.place}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.id}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.lastName}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'left' }}>{comp.affiliation}</td>
                  <td style={{ ...tableCellStyle, textAlign: 'right' }}>{comp.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={helpTextStyle}>
            Press Esc to exit expanded table mode.
          </div>
          <div style={helpTextStyle}>
            Version 1.1 - Gordon Lester - web@kingstonandpoly.org
          </div>
        </div>
      )}

      {/* Full screen toggle buttons (always visible, bottom right) */}
      <div style={fullScreenButtonStyle}>
        <button onClick={() => setExpandedTable(!expandedTable)} style={buttonStyle}>
          {expandedTable ? 'Exit Full Screen Table' : 'Full Screen Table'}
        </button>
        <button onClick={toggleAppFullScreen} style={buttonStyle}>
          {appFullScreen ? 'Exit Full Screen App' : 'Full Screen App'}
        </button>
        <div style={helpTextStyle}>
          Press Esc to exit full screen modes.
        </div>
        <div style={helpTextStyle}>
          Version 1.2 - Gordon Lester - web@kingstonandpoly.org
        </div>
      </div>
    </div>
  );
}

export default App;
