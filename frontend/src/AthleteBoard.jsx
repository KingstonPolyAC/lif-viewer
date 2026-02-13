import React, { useState, useEffect, useMemo, useRef } from 'react';

function AthleteBoard() {
  const [lifDataArray, setLifDataArray] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBib, setSelectedBib] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef(null);

  // Fetch all LIF data every 3 seconds (same pattern as Results.jsx)
  useEffect(() => {
    async function fetchData() {
      try {
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
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Build a map of athletes from all events, keyed by bib ID
  const athleteMap = useMemo(() => {
    const map = {};
    for (const lif of lifDataArray) {
      if (!lif.competitors) continue;
      for (const comp of lif.competitors) {
        const bib = comp.id;
        if (!bib) continue;
        if (!map[bib]) {
          map[bib] = {
            bib,
            firstName: comp.firstName || '',
            lastName: comp.lastName || '',
            affiliation: comp.affiliation || '',
            events: [],
          };
        }
        map[bib].events.push({
          eventName: lif.eventName || '',
          wind: lif.wind || '',
          place: comp.place || '',
          time: comp.time || '',
        });
      }
    }
    return map;
  }, [lifDataArray]);

  // Live search results: filter as user types
  const searchResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return Object.values(athleteMap).filter((athlete) => {
      const full = `${athlete.firstName} ${athlete.lastName}`.toLowerCase();
      const first = athlete.firstName.toLowerCase();
      const last = athlete.lastName.toLowerCase();
      const bib = athlete.bib.toLowerCase();
      if (bib === term || bib.startsWith(term)) return true;
      if (first.includes(term) || last.includes(term) || full.includes(term)) return true;
      return false;
    });
  }, [searchTerm, athleteMap]);

  // Auto-select if exactly one match
  const effectiveBib = useMemo(() => {
    if (selectedBib) return selectedBib;
    if (searchResults.length === 1) return searchResults[0].bib;
    return null;
  }, [selectedBib, searchResults]);

  const selectedAthlete = effectiveBib ? athleteMap[effectiveBib] : null;

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelectedBib(null);
    setDropdownOpen(true);
  };

  const handleSelect = (bib) => {
    setSelectedBib(bib);
    setDropdownOpen(false);
  };

  const handleBackToResults = () => {
    setSelectedBib(null);
    setDropdownOpen(true);
  };

  const ordinal = (n) => {
    const num = parseInt(n, 10);
    if (isNaN(num)) return n;
    const s = ['th', 'st', 'nd', 'rd'];
    const v = num % 100;
    return num + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Accessible color palette
  // All colors verified for WCAG AA contrast on their backgrounds
  const colors = {
    bg: '#111',
    brandBg: '#003366',
    searchBg: '#1a1a2e',
    inputBg: '#0d0d20',
    cardBg: '#1a1a40',
    dropdownBg: '#1c1c3a',
    dropdownHover: '#2a2a50',
    border: '#5a9fd4',       // lighter steel blue for better visibility
    textPrimary: '#ffffff',
    textSecondary: '#c8c8c8', // light gray, 8.5:1 on #111
    textMuted: '#a0a0a0',     // medium gray, 5.5:1 on #111
    gold: '#FFD700',
    wind: '#b0b0b0',          // 7:1 on card background
    eventLabel: '#7eb8e0',    // accessible light blue, 5.5:1 on #1a1a40
    link: '#7eb8e0',
  };

  const hasSearch = searchTerm.trim().length > 0;
  const showDropdown = dropdownOpen && hasSearch && searchResults.length > 1 && !selectedBib;
  const showPhotoBoard = hasSearch && selectedAthlete;
  const noResults = hasSearch && searchResults.length === 0;

  return (
    <div style={{ background: colors.bg, minHeight: '100vh', color: colors.textPrimary }}>
      {/* Branding bar */}
      <div style={{
        background: colors.brandBg,
        color: colors.textPrimary,
        padding: '10px 24px',
        fontSize: 'clamp(0.9rem, 2vw, 1.3rem)',
        fontWeight: 'bold',
        textAlign: 'center',
        letterSpacing: '1px',
      }}>
        PolyField Analytics &nbsp;|&nbsp; www.polyfield.co.uk
      </div>

      {/* Search bar with dropdown */}
      <div style={{
        background: colors.searchBg,
        padding: '12px 24px',
        display: 'flex',
        justifyContent: 'center',
      }}>
        <div ref={searchRef} style={{ position: 'relative', width: '100%', maxWidth: '600px' }}>
          <input
            type="text"
            style={{
              fontSize: 'clamp(1rem, 2.5vw, 1.4rem)',
              padding: '10px 20px',
              borderRadius: showDropdown ? '8px 8px 0 0' : '8px',
              border: `2px solid ${colors.border}`,
              background: colors.inputBg,
              color: colors.textPrimary,
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
            placeholder="Search by athlete name or bib number..."
            value={searchTerm}
            onChange={handleSearchChange}
            onFocus={() => setDropdownOpen(true)}
            autoFocus
          />

          {/* Dropdown results */}
          {showDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              background: colors.dropdownBg,
              border: `2px solid ${colors.border}`,
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              maxHeight: '300px',
              overflowY: 'auto',
              zIndex: 100,
            }}>
              {searchResults.map((athlete) => (
                <div
                  key={athlete.bib}
                  onClick={() => handleSelect(athlete.bib)}
                  style={{
                    padding: '12px 20px',
                    cursor: 'pointer',
                    borderBottom: `1px solid ${colors.border}33`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = colors.dropdownHover}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <span style={{ fontWeight: 'bold', fontSize: 'clamp(1rem, 2vw, 1.2rem)' }}>
                      {athlete.firstName} {athlete.lastName}
                    </span>
                    {athlete.affiliation && (
                      <span style={{ color: colors.textMuted, marginLeft: '12px', fontSize: 'clamp(0.8rem, 1.5vw, 1rem)' }}>
                        {athlete.affiliation}
                      </span>
                    )}
                  </div>
                  <span style={{ color: colors.textSecondary, fontSize: 'clamp(0.9rem, 1.5vw, 1.1rem)' }}>
                    #{athlete.bib}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Prompt text when no search */}
      {!hasSearch && (
        <div style={{
          color: colors.textMuted,
          fontSize: 'clamp(1.2rem, 3vw, 2rem)',
          textAlign: 'center',
          marginTop: '80px',
          padding: '0 20px',
        }}>
          Enter an athlete name or bib number to view their results
        </div>
      )}

      {/* No results */}
      {noResults && (
        <div style={{
          color: colors.textMuted,
          fontSize: 'clamp(1.2rem, 3vw, 2rem)',
          textAlign: 'center',
          marginTop: '80px',
          padding: '0 20px',
        }}>
          No athletes found for &ldquo;{searchTerm.trim()}&rdquo;
        </div>
      )}

      {/* Photo board */}
      {showPhotoBoard && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 'calc(100vh - 110px)',
        }}>
          {/* Hero name */}
          <div style={{ textAlign: 'center', padding: 'clamp(16px, 3vh, 40px) 24px clamp(8px, 1.5vh, 16px)' }}>
            <div style={{
              fontSize: 'clamp(2.5rem, 7vw, 6rem)',
              fontWeight: 'bold',
              color: colors.textPrimary,
              textTransform: 'uppercase',
              letterSpacing: '4px',
              lineHeight: 1.1,
            }}>
              {selectedAthlete.firstName} {selectedAthlete.lastName}
            </div>
            <div style={{
              fontSize: 'clamp(1rem, 2.5vw, 1.8rem)',
              color: colors.textSecondary,
              marginTop: '8px',
            }}>
              Bib #{selectedAthlete.bib}
              {selectedAthlete.affiliation ? ` — ${selectedAthlete.affiliation}` : ''}
            </div>
          </div>

          {/* Event cards - flexbox to fill screen */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'stretch',
            gap: 'clamp(12px, 2vw, 24px)',
            padding: 'clamp(8px, 2vw, 24px)',
            flex: 1,
          }}>
            {selectedAthlete.events.map((evt, idx) => (
              <div key={idx} style={{
                background: colors.cardBg,
                borderRadius: '16px',
                padding: 'clamp(16px, 3vw, 40px) clamp(20px, 3vw, 48px)',
                textAlign: 'center',
                flex: selectedAthlete.events.length <= 2 ? '1 1 400px' : '1 1 300px',
                maxWidth: selectedAthlete.events.length === 1 ? '800px' : '600px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minHeight: 'clamp(180px, 25vh, 350px)',
              }}>
                <div style={{
                  fontSize: 'clamp(1rem, 2.5vw, 1.5rem)',
                  color: colors.eventLabel,
                  fontWeight: 'bold',
                  marginBottom: 'clamp(8px, 1.5vh, 20px)',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}>
                  {evt.eventName}
                </div>
                <div style={{
                  fontSize: 'clamp(2.5rem, 6vw, 5rem)',
                  fontWeight: 'bold',
                  color: colors.gold,
                  lineHeight: 1.1,
                }}>
                  {ordinal(evt.place)}
                </div>
                <div style={{
                  fontSize: 'clamp(2rem, 5vw, 4rem)',
                  fontWeight: 'bold',
                  color: colors.textPrimary,
                  margin: 'clamp(4px, 1vh, 12px) 0',
                  lineHeight: 1.1,
                }}>
                  {evt.time}
                </div>
                {evt.wind && (
                  <div style={{
                    fontSize: 'clamp(1rem, 2vw, 1.4rem)',
                    color: colors.wind,
                    marginTop: 'clamp(4px, 0.5vh, 8px)',
                  }}>
                    Wind: {evt.wind}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Back link if multiple matches */}
          {searchResults.length > 1 && selectedBib && (
            <div style={{ textAlign: 'center', padding: '12px 0 24px' }}>
              <span
                style={{
                  color: colors.link,
                  cursor: 'pointer',
                  fontSize: 'clamp(0.9rem, 2vw, 1.1rem)',
                  textDecoration: 'underline',
                }}
                onClick={handleBackToResults}
              >
                &#8592; Back to results
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AthleteBoard;
