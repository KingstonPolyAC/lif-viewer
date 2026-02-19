import React, { useRef, useEffect, useState } from 'react';
import polyfieldLogo from './polyfield-logo.png';

const SIZE = 1080;

const METERS_PER_MILE = 1609.344;

// Minimum row height determines max events per page
const MIN_ROW_HEIGHT = 36;
const BODY_START_Y = 210;
const FOOTER_TOP = 980;
const MAX_PER_PAGE = Math.floor((FOOTER_TOP - BODY_START_Y - 10) / MIN_ROW_HEIGHT);

function SocialGraphic({ isOpen, onClose, stats, onSave }) {
  const canvasRef = useRef(null);
  const [logoImg, setLogoImg] = useState(null);
  const [useMiles, setUseMiles] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [view, setView] = useState('stats');
  const [speedPage, setSpeedPage] = useState(0);

  // Reset speed page when switching views
  useEffect(() => {
    setSpeedPage(0);
  }, [view]);

  // Load logo image once
  useEffect(() => {
    const img = new Image();
    img.onload = () => setLogoImg(img);
    img.src = polyfieldLogo;
  }, []);

  // Compute pagination values
  const events = (stats && stats.eventSpeeds) || [];
  const totalPages = Math.max(1, Math.ceil(events.length / MAX_PER_PAGE));

  // Draw canvas whenever stats, logo, view, units, or page changes
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Background: diagonal gradient
    const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    grad.addColorStop(0, '#001a33');
    grad.addColorStop(0.5, '#003366');
    grad.addColorStop(1, '#001a33');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    if (view === 'stats') {
      // ── STATS VIEW (existing) ──
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 52px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('COMPETITION STATS', SIZE / 2, 120);

      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(140, 160);
      ctx.lineTo(SIZE - 140, 160);
      ctx.stroke();

      const cardW = 420;
      const cardH = 280;
      const gapX = 60;
      const gapY = 40;
      const startX = (SIZE - (cardW * 2 + gapX)) / 2;
      const startY = 220;

      let distanceDisplay = stats.totalDistance;
      const rawMeters = stats.totalDistanceM;
      if (typeof rawMeters === 'number' && rawMeters > 0) {
        if (useMiles) {
          distanceDisplay = (rawMeters / METERS_PER_MILE).toFixed(1) + ' miles';
        } else if (rawMeters >= 1000) {
          distanceDisplay = (rawMeters / 1000).toFixed(1) + ' km';
        } else {
          distanceDisplay = rawMeters + ' m';
        }
      }

      const cards = [
        { value: distanceDisplay, label: 'TOTAL DISTANCE' },
        { value: stats.totalAthletes, label: 'RACE ENTRIES' },
        { value: stats.totalTime, label: 'TOTAL RACE TIME' },
        { value: stats.avgWind, label: 'AVERAGE WIND' },
      ];

      cards.forEach((card, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = startX + col * (cardW + gapX);
        const y = startY + row * (cardH + gapY);

        const radius = 16;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + cardW - radius, y);
        ctx.quadraticCurveTo(x + cardW, y, x + cardW, y + radius);
        ctx.lineTo(x + cardW, y + cardH - radius);
        ctx.quadraticCurveTo(x + cardW, y + cardH, x + cardW - radius, y + cardH);
        ctx.lineTo(x + radius, y + cardH);
        ctx.quadraticCurveTo(x, y + cardH, x, y + cardH - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();

        ctx.fillStyle = 'rgba(0, 26, 51, 0.8)';
        ctx.fill();
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const valueStr = String(card.value || '\u2014');
        let fontSize = 64;
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        while (ctx.measureText(valueStr).width > cardW - 40 && fontSize > 28) {
          fontSize -= 4;
          ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        }
        ctx.fillText(valueStr, x + cardW / 2, y + cardH / 2 - 20);

        ctx.fillStyle = '#c0c0c0';
        ctx.font = '24px Arial, sans-serif';
        ctx.fillText(card.label, x + cardW / 2, y + cardH / 2 + 40);
      });
    } else {
      // ── SPEEDS VIEW ──
      const titleText = totalPages > 1
        ? `EVENT SPEEDS (${speedPage + 1}/${totalPages})`
        : 'EVENT SPEEDS';

      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 52px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(titleText, SIZE / 2, 100);

      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(140, 140);
      ctx.lineTo(SIZE - 140, 140);
      ctx.stroke();

      if (events.length === 0) {
        ctx.fillStyle = '#c0c0c0';
        ctx.font = '32px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No track events found', SIZE / 2, SIZE / 2);
      } else {
        // Slice events for current page
        const pageStart = speedPage * MAX_PER_PAGE;
        const pageEvents = events.slice(pageStart, pageStart + MAX_PER_PAGE);

        const tableLeft = 60;
        const tableRight = SIZE - 60;
        const tableWidth = tableRight - tableLeft;
        const col1Width = tableWidth * 0.55;
        const col2Width = tableWidth * 0.22;
        const col3Width = tableWidth * 0.23;
        const col2Center = tableLeft + col1Width + col2Width / 2;
        const col3Center = tableLeft + col1Width + col2Width + col3Width / 2;

        // Header row
        const headerY = 170;
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 26px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('EVENT', tableLeft + 10, headerY);
        ctx.textAlign = 'center';
        ctx.fillText('m/s', col2Center, headerY);
        ctx.fillText('mph', col3Center, headerY);

        // Table body
        const availableHeight = FOOTER_TOP - BODY_START_Y - 10;
        const rowHeight = Math.min(50, Math.max(MIN_ROW_HEIGHT, availableHeight / pageEvents.length));
        const fontSize = Math.max(14, Math.min(28, rowHeight * 0.6));

        pageEvents.forEach((evt, i) => {
          const rowY = BODY_START_Y + i * rowHeight;

          // Alternating row background
          if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(0, 26, 51, 0.6)';
            ctx.fillRect(tableLeft, rowY, tableWidth, rowHeight);
          }

          const textY = rowY + rowHeight / 2;

          // Event name (left-aligned, white, truncated)
          ctx.fillStyle = '#ffffff';
          ctx.font = `${fontSize}px Arial, sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          let name = evt.eventName || '';
          const maxNameWidth = col1Width - 20;
          while (ctx.measureText(name).width > maxNameWidth && name.length > 1) {
            name = name.slice(0, -1);
          }
          if (name.length < (evt.eventName || '').length) {
            name = name.slice(0, -1) + '\u2026';
          }
          ctx.fillText(name, tableLeft + 10, textY);

          // Speed m/s (centred, gold)
          ctx.fillStyle = '#FFD700';
          ctx.font = `bold ${fontSize}px Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(evt.speedMs.toFixed(2), col2Center, textY);

          // Speed mph (centred, gold)
          ctx.fillText(evt.speedMph.toFixed(2), col3Center, textY);
        });
      }
    }

    // Footer bar (shared)
    ctx.fillStyle = '#003366';
    ctx.fillRect(0, FOOTER_TOP, SIZE, SIZE - FOOTER_TOP);

    if (logoImg) {
      ctx.drawImage(logoImg, 30, 990, 70, 70);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '28px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('www.polyfield.co.uk', SIZE / 2, 1030);
  }, [isOpen, stats, logoImg, useMiles, view, speedPage, events.length, totalPages]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    let units;
    if (view === 'speeds') {
      units = totalPages > 1 ? `Speeds_${speedPage + 1}` : 'Speeds';
    } else {
      units = useMiles ? 'Miles' : 'KM';
    }
    if (onSave) {
      try {
        const path = await onSave(dataUrl, units);
        const filename = path ? path.split('/').pop().split('\\').pop() : 'file';
        setSaveMessage(`PNG saved in results directory: ${filename}`);
        setTimeout(() => setSaveMessage(''), 5000);
      } catch {
        setSaveMessage('Failed to save PNG');
        setTimeout(() => setSaveMessage(''), 5000);
      }
    }
  };

  const toggleBtnStyle = (active) => ({
    backgroundColor: active ? '#FFD700' : 'transparent',
    color: active ? '#001a33' : '#FFD700',
    border: '1px solid #FFD700',
    borderRadius: '8px',
    padding: '12px 24px',
    fontWeight: 'bold',
    fontSize: '1rem',
    cursor: 'pointer',
  });

  const pageBtnStyle = (disabled) => ({
    backgroundColor: 'transparent',
    color: disabled ? '#555' : '#FFD700',
    border: `1px solid ${disabled ? '#555' : '#FFD700'}`,
    borderRadius: '8px',
    padding: '12px 16px',
    fontWeight: 'bold',
    fontSize: '1rem',
    cursor: disabled ? 'default' : 'pointer',
  });

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        maxHeight: '95vh',
      }}>
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          style={{
            maxWidth: '90vw',
            maxHeight: '75vh',
            objectFit: 'contain',
            borderRadius: '8px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          }}
        />
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={() => setView('stats')} style={toggleBtnStyle(view === 'stats')}>Stats</button>
          <button onClick={() => setView('speeds')} style={toggleBtnStyle(view === 'speeds')}>Speeds</button>
          {view === 'stats' && (
            <button onClick={() => setUseMiles(prev => !prev)} style={{
              backgroundColor: 'transparent',
              color: '#FFD700',
              border: '1px solid #FFD700',
              borderRadius: '8px',
              padding: '12px 24px',
              fontWeight: 'bold',
              fontSize: '1rem',
              cursor: 'pointer',
            }}>{useMiles ? 'Miles' : 'KM'}</button>
          )}
          {view === 'speeds' && totalPages > 1 && (
            <>
              <button
                onClick={() => setSpeedPage(p => Math.max(0, p - 1))}
                disabled={speedPage === 0}
                style={pageBtnStyle(speedPage === 0)}
              >&larr;</button>
              <span style={{ color: '#FFD700', fontSize: '1rem', fontWeight: 'bold', minWidth: '50px', textAlign: 'center' }}>
                {speedPage + 1}/{totalPages}
              </span>
              <button
                onClick={() => setSpeedPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={speedPage === totalPages - 1}
                style={pageBtnStyle(speedPage === totalPages - 1)}
              >&rarr;</button>
            </>
          )}
          <button onClick={handleSave} style={{
            backgroundColor: '#FFD700',
            color: '#001a33',
            border: 'none',
            borderRadius: '8px',
            padding: '12px 32px',
            fontWeight: 'bold',
            fontSize: '1rem',
            cursor: 'pointer',
          }}>Save PNG</button>
          <button onClick={onClose} style={{
            backgroundColor: 'transparent',
            color: '#e0e0e0',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '12px 32px',
            fontSize: '1rem',
            cursor: 'pointer',
          }}>Close</button>
        </div>
        {saveMessage && (
          <div style={{
            color: '#2e7d32',
            backgroundColor: 'rgba(46, 125, 50, 0.15)',
            border: '1px solid #2e7d32',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '0.9rem',
          }}>{saveMessage}</div>
        )}
      </div>
    </div>
  );
}

export default SocialGraphic;
