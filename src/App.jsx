import { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Cpu, 
  Layers, 
  Settings, 
  AlertTriangle, 
  TrendingUp, 
  Plus, 
  Trash2, 
  Upload, 
  Play, 
  FileText, 
  CheckCircle, 
  RefreshCw, 
  AlertCircle, 
  Car, 
  FileSpreadsheet, 
  Server, 
  Clock, 
  Database,
  Sliders,
  Sparkles,
  ArrowRight,
  TrendingDown,
  LogOut
} from 'lucide-react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001';


function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('isLoggedIn') === 'true');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [apiStatus, setApiStatus] = useState('connecting');
  const [dbConnected, setDbConnected] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);  // ← global loader
  const [globalLoadingMsg, setGlobalLoadingMsg] = useState('Loading...');

  // PDC Monitor state
  const [pdcStatus, setPdcStatus] = useState(null);
  const [pdcLogs, setPdcLogs] = useState([
    { id: 1, time: new Date().toLocaleTimeString(), text: 'System initialized. Node.js backend listening on Port 5001.' },
    { id: 2, time: new Date().toLocaleTimeString(), text: 'Python sub-process bridge ready.' }
  ]);

  // CV Pipeline state
  const [cvInputMode, setCvInputMode] = useState('upload'); // 'upload' | 'url'
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [urlPreviewSrc, setUrlPreviewSrc] = useState(null);
  const [isProcessingCv, setIsProcessingCv] = useState(false);
  const [cvError, setCvError] = useState(null);
  const [cvResult, setCvResult] = useState(null);
  const [cvStatusMessage, setCvStatusMessage] = useState('');

  // Fuzzy Calculator state
  const [densitySlider, setDensitySlider] = useState(50);
  const [emergencyToggle, setEmergencyToggle] = useState(false);
  const [isCalculatingFuzzy, setIsCalculatingFuzzy] = useState(false);
  const [fuzzyResult, setFuzzyResult] = useState(null);
  const [fuzzyError, setFuzzyError] = useState(null);

  // Table filters & sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [emergencyFilter, setEmergencyFilter] = useState('all');
  const [sortField, setSortField] = useState('timestamp');
  const [sortDirection, setSortDirection] = useState('desc');

  // Chart Tooltip state
  const [hoveredData, setHoveredData] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const fileInputRef = useRef(null);

  // Poll PDC status and check API health (every 10s to reduce latency load)
  useEffect(() => {
    const fetchPdcStatus = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${API_BASE}/api/pdc/status`, { signal: controller.signal });
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        setPdcStatus(data);
        setDbConnected(data.dbConnected);
        setApiStatus('online');
      } catch (err) {
        if (err.name !== 'AbortError') setApiStatus('offline');
      } finally {
        clearTimeout(timeout);
      }
    };

    fetchPdcStatus();
    const interval = setInterval(fetchPdcStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch transactions with 8s timeout
  const fetchTransactions = async () => {
    setLoadingTransactions(true);
    setIsGlobalLoading(true);
    setGlobalLoadingMsg('Fetching transaction logs...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${API_BASE}/api/transactions`, { signal: controller.signal });
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Failed to fetch transactions:', err);
    } finally {
      clearTimeout(timeout);
      setLoadingTransactions(false);
      setIsGlobalLoading(false);
    }
  };

  // Only fetch transactions when switching TO data tabs
  useEffect(() => {
    if (activeTab === 'dashboard' || activeTab === 'cv' || activeTab === 'fuzzy') {
      fetchTransactions();
    }
  }, [activeTab]);


  // Log message helper
  const addPdcLog = (text) => {
    setPdcLogs(prev => [
      { id: Date.now(), time: new Date().toLocaleTimeString(), text },
      ...prev.slice(0, 49) // Keep last 50 logs
    ]);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginUsername === 'khalid' && loginPassword === 'khalid123') {
      setIsLoggedIn(true);
      localStorage.setItem('isLoggedIn', 'true');
      setLoginError('');
      setPdcLogs(prev => [
        { id: Date.now(), time: new Date().toLocaleTimeString(), text: 'Security: User "khalid" authenticated successfully.' },
        ...prev
      ]);
    } else {
      setLoginError('Invalid username or password. Please try again.');
      setPdcLogs(prev => [
        { id: Date.now(), time: new Date().toLocaleTimeString(), text: 'Security Alert: Failed login attempt.' },
        ...prev
      ]);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('isLoggedIn');
    setLoginUsername('');
    setLoginPassword('');
    setPdcLogs(prev => [
      { id: Date.now(), time: new Date().toLocaleTimeString(), text: 'Security: User logged out.' },
      ...prev
    ]);
  };

  // Image Upload handler
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setCvResult(null);
      setCvError(null);
    }
  };

  const uploadAndProcessImage = async (fileToUpload) => {
    if (!fileToUpload) return;
    setIsProcessingCv(true);
    setIsGlobalLoading(true);
    setGlobalLoadingMsg('Running YOLOv8 CV Pipeline...');
    setCvError(null);
    setCvResult(null);
    
    addPdcLog(`Spawning parallel child process: CV & Object Detection for file ${fileToUpload.name}`);
    setCvStatusMessage('Step 1/3: Sending image to backend...');

    const formData = new FormData();
    formData.append('trafficImage', fileToUpload);

    try {
      // Simulate status progression for visual refinement
      setTimeout(() => setCvStatusMessage('Step 2/3: Running YOLOv8 Detection model...'), 1000);
      setTimeout(() => setCvStatusMessage('Step 3/3: Evaluating results with Fuzzy Engine...'), 2200);

      const res = await fetch(`${API_BASE}/api/cv/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Image processing failed');
      }

      const data = await res.json();
      setCvResult(data);
      addPdcLog(`CV and Fuzzy processing completed successfully for ${fileToUpload.name}. Result green timer: ${data.fuzzyDetails.calculated_timer}s.`);
      fetchTransactions();
    } catch (err) {
      setCvError(err.message || 'Connection or script execution error');
      addPdcLog(`⚠️ Error during CV Processing of ${fileToUpload.name}: ${err.message}`);
    } finally {
      setIsProcessingCv(false);
      setIsGlobalLoading(false);
      setCvStatusMessage('');
    }
  };

  const triggerUpload = () => {
    uploadAndProcessImage(selectedFile);
  };

  // Process a pre-configured sample image
  const processSample = async (samplePath, filename) => {
    setIsProcessingCv(true);
    setCvError(null);
    setCvResult(null);
    setCvStatusMessage('Step 1/3: Fetching sample image...');
    addPdcLog(`User triggered sample processing: ${filename}`);

    try {
      const res = await fetch(samplePath);
      if (!res.ok) throw new Error(`Could not load sample image: ${filename}`);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: 'image/jpeg' });
      
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      
      await uploadAndProcessImage(file);
    } catch (err) {
      setCvError(err.message);
      setIsProcessingCv(false);
      setCvStatusMessage('');
      addPdcLog(`⚠️ Sample processing failed: ${err.message}`);
    }
  };

  // Analyze an image from a public URL
  const analyzeImageUrl = async () => {
    const url = imageUrlInput.trim();
    if (!url) return;
    setIsProcessingCv(true);
    setIsGlobalLoading(true);
    setGlobalLoadingMsg('Fetching image from URL...');
    setCvError(null);
    setCvResult(null);
    setUrlPreviewSrc(url);
    addPdcLog(`URL Analysis triggered: fetching image from ${url}`);
    setCvStatusMessage('Step 1/3: Downloading image from URL...');

    try {
      setTimeout(() => setCvStatusMessage('Step 2/3: Running YOLOv8 Detection model...'), 1200);
      setTimeout(() => setCvStatusMessage('Step 3/3: Evaluating results with Fuzzy Engine...'), 2500);

      const res = await fetch(`${API_BASE}/api/cv/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: url })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'URL image processing failed');
      }

      const data = await res.json();
      setCvResult(data);
      // Use the downloaded-and-processed server path for preview
      setPreviewUrl(`${API_BASE}${data.transaction.filePath}`);
      addPdcLog(`URL CV analysis complete. Green timer: ${data.fuzzyDetails.calculated_timer}s.`);
      fetchTransactions();
    } catch (err) {
      setCvError(err.message || 'Failed to fetch or process image from URL');
      addPdcLog(`⚠️ URL CV Error: ${err.message}`);
    } finally {
      setIsProcessingCv(false);
      setIsGlobalLoading(false);
      setCvStatusMessage('');
    }
  };

  // Manual Fuzzy calculation
  const calculateManualFuzzy = async () => {
    setIsCalculatingFuzzy(true);
    setIsGlobalLoading(true);
    setGlobalLoadingMsg('Running Fuzzy Logic Engine...');
    setFuzzyError(null);
    setFuzzyResult(null);
    addPdcLog(`Triggered manual Fuzzy Calculation. Density: ${densitySlider}%, Emergency: ${emergencyToggle ? 'Active' : 'Normal'}`);

    try {
      const res = await fetch(`${API_BASE}/api/fuzzy/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trafficDensity: densitySlider,
          emergencyStatus: emergencyToggle ? 'emergency' : 'normal'
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Fuzzy calculation failed');
      }

      const data = await res.json();
      setFuzzyResult(data);
      addPdcLog(`Manual Fuzzy logic complete. Green timer set to ${data.fuzzyDetails.calculated_timer}s.`);
      fetchTransactions();
    } catch (err) {
      setFuzzyError(err.message);
      addPdcLog(`⚠️ Manual Fuzzy logic calculation failed: ${err.message}`);
    } finally {
      setIsCalculatingFuzzy(false);
      setIsGlobalLoading(false);
    }
  };

  // Clear all transactions
  const clearAllLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all transaction logs?')) return;
    addPdcLog('Clearing transaction history logs...');
    try {
      const res = await fetch(`${API_BASE}/api/transactions/clear`, {
        method: 'POST'
      });
      if (res.ok) {
        setTransactions([]);
        addPdcLog('Transaction logs cleared.');
      } else {
        throw new Error('Failed to clear logs');
      }
    } catch (err) {
      addPdcLog(`⚠️ Failed to clear logs: ${err.message}`);
    }
  };

  // Filtered and Sorted transactions
  const processedTransactions = transactions
    .filter(t => {
      const matchesSearch = t.fileName ? t.fileName.toLowerCase().includes(searchTerm.toLowerCase()) : true;
      const matchesSource = sourceFilter === 'all' ? true : t.source === sourceFilter;
      const matchesEmergency = emergencyFilter === 'all' ? true : t.emergencyStatus === emergencyFilter;
      return matchesSearch && matchesSource && matchesEmergency;
    })
    .sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      if (sortField === 'timestamp') {
        aVal = new Date(a.timestamp).getTime();
        bVal = new Date(b.timestamp).getTime();
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Get aggregated stats
  const totalProcessed = transactions.length;
  const avgProcessingTime = transactions.length 
    ? Math.round(transactions.reduce((acc, t) => acc + t.processingTimeMs, 0) / transactions.length) 
    : 0;
  const avgDensity = transactions.length 
    ? Math.round(transactions.reduce((acc, t) => acc + t.trafficDensity, 0) / transactions.length) 
    : 0;
  const emergencyCount = transactions.filter(t => t.emergencyStatus === 'emergency').length;

  if (!isLoggedIn) {
    return (
      <div className="login-container fade-in">
        <div className="login-card">
          <div className="login-logo-section">
            <div className="login-logo-icon">
              <Activity size={32} className="icon-pulse" />
            </div>
            <h2 className="login-title">AETHER</h2>
            <span className="login-subtitle">TRAFFIC HUB SECURE PORTAL</span>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <div className="login-input-group">
              <label className="login-input-label">Username</label>
              <input
                type="text"
                placeholder="Enter username"
                className="custom-input"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                required
              />
            </div>

            <div className="login-input-group">
              <label className="login-input-label">Password</label>
              <input
                type="password"
                placeholder="Enter password"
                className="custom-input"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </div>

            {loginError && (
              <div className="login-error-msg">
                <AlertCircle size={16} className="login-error-icon" />
                <span>{loginError}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary login-btn">
              <span>Sign In</span>
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* ── Global Loader Overlay ── */}
      {isGlobalLoading && (
        <div className="global-loader-overlay">
          <div className="global-loader-ring" />
          <span className="global-loader-text">{globalLoadingMsg}</span>
        </div>
      )}
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon">
            <Activity size={24} className="icon-pulse" />
          </div>
          <div>
            <h2 className="logo-title">AETHER</h2>
            <span className="logo-subtitle">TRAFFIC HUB</span>
          </div>
        </div>

        <div className="navigation">
          <button 
            className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Layers size={18} />
            <span>Dashboard</span>
          </button>
          
          <button 
            className={`nav-btn ${activeTab === 'cv' ? 'active' : ''}`}
            onClick={() => setActiveTab('cv')}
          >
            <Cpu size={18} />
            <span>CV Pipeline</span>
          </button>

          <button 
            className={`nav-btn ${activeTab === 'fuzzy' ? 'active' : ''}`}
            onClick={() => setActiveTab('fuzzy')}
          >
            <Sliders size={18} />
            <span>Fuzzy Calculator</span>
          </button>

          <button 
            className={`nav-btn ${activeTab === 'pdc' ? 'active' : ''}`}
            onClick={() => setActiveTab('pdc')}
          >
            <Server size={18} />
            <span>PDC Monitor</span>
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="connection-status">
            <div className="status-item">
              <span className={`pulse-dot ${apiStatus === 'online' ? 'green' : 'red'}`}></span>
              <span>API: {apiStatus.toUpperCase()}</span>
            </div>
            <div className="status-item">
              <span className={`pulse-dot ${dbConnected ? 'green' : 'red'}`}></span>
              <span>DB: {dbConnected ? 'MONGODB' : 'IN-MEMORY'}</span>
            </div>
          </div>
          <div className="logout-btn-container">
            <button className="logout-btn" onClick={handleLogout}>
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="main-content">
        <header className="header">
          <div>
            <div className="breadcrumbs">SYSTEM / {activeTab.toUpperCase()}</div>
            <h1 className="header-title">
              {activeTab === 'dashboard' && 'Operations Dashboard'}
              {activeTab === 'cv' && 'Computer Vision Traffic Analyzer'}
              {activeTab === 'fuzzy' && 'Fuzzy Logic Light Controller'}
              {activeTab === 'pdc' && 'Parallel Distributed Computing Status'}
            </h1>
          </div>

          <div className="header-stats">
            <div className="quick-spec">
              <Clock size={14} />
              <span>Uptime: {pdcStatus ? `${Math.floor(pdcStatus.uptimeSeconds / 60)}m` : '0m'}</span>
            </div>
            <div className="quick-spec">
              <Cpu size={14} />
              <span>Parallel Threads: {pdcStatus?.activeParallelProcesses || 0}</span>
            </div>
          </div>
        </header>

        <div className="page-body">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="tab-pane fade-in">
              {/* Stats Row */}
              <div className="stats-row">
                <div className="glass-card blue-glow">
                  <div className="stat-icon blue"><FileText size={20} /></div>
                  <div className="stat-val">{totalProcessed}</div>
                  <div className="stat-label">Total Transactions</div>
                  <div className="stat-desc">Analyzed traffic operations</div>
                </div>

                <div className="glass-card purple-glow">
                  <div className="stat-icon purple"><Clock size={20} /></div>
                  <div className="stat-val">{avgProcessingTime}<span className="unit">ms</span></div>
                  <div className="stat-label">Avg Processing Time</div>
                  <div className="stat-desc">Python runtime execution</div>
                </div>

                <div className="glass-card green-glow">
                  <div className="stat-icon green"><TrendingUp size={20} /></div>
                  <div className="stat-val">{avgDensity}<span className="unit">%</span></div>
                  <div className="stat-label">Average Traffic Load</div>
                  <div className="stat-desc">Normal peak vehicle load</div>
                </div>

                <div className="glass-card red-glow">
                  <div className="stat-icon red"><AlertTriangle size={20} /></div>
                  <div className="stat-val">{emergencyCount}</div>
                  <div className="stat-label">Emergencies Solved</div>
                  <div className="stat-desc">Ambulances prioritized</div>
                </div>
              </div>

              {/* Chart and System Details */}
              <div className="dashboard-grid">
                <div className="glass-card grid-col-2">
                  <h3 className="card-title">Performance Analytics</h3>
                  <p className="card-subtitle">Relationship between density, calculated green light timer, and execution time</p>
                  
                  {/* SVG Chart */}
                  <div className="chart-wrapper">
                    {transactions.length < 2 ? (
                      <div className="no-chart-data">
                        <TrendingDown size={40} className="text-muted" />
                        <p>Insufficient transaction logs to plot chart.</p>
                        <p className="text-secondary">Process a few images in CV Pipeline or run Fuzzy Calculator.</p>
                      </div>
                    ) : (
                      <div className="svg-chart-container" style={{ position: 'relative' }}>
                        <svg className="svg-chart" viewBox="0 0 500 200" width="100%" height="220"
                          onMouseLeave={() => setHoveredData(null)}
                        >
                          {/* Grid Lines */}
                          <line x1="40" y1="20" x2="480" y2="20" stroke="#1f253f" strokeDasharray="3,3" />
                          <line x1="40" y1="85" x2="480" y2="85" stroke="#1f253f" strokeDasharray="3,3" />
                          <line x1="40" y1="150" x2="480" y2="150" stroke="#1f253f" strokeDasharray="3,3" />
                          <line x1="40" y1="170" x2="480" y2="170" stroke="#242b47" strokeWidth="1.5" />
                          <line x1="40" y1="20" x2="40" y2="170" stroke="#242b47" strokeWidth="1.5" />

                          {/* Chart Lines */}
                          {(() => {
                            const last10 = [...transactions].reverse().slice(-10);
                            const pointsDensity = [];
                            const pointsTimer = [];
                            const step = last10.length > 1 ? 440 / (last10.length - 1) : 440;
                            
                            last10.forEach((t, i) => {
                              const x = 40 + i * step;
                              // Normalize density (0-100%) to y (170 down to 20)
                              const yD = 170 - (t.trafficDensity / 100) * 150;
                              // Normalize timer (10-90s) to y (170 down to 20)
                              const yT = 170 - ((t.calculatedTimer - 10) / 80) * 150;
                              
                              pointsDensity.push(`${x},${yD}`);
                              pointsTimer.push(`${x},${yT}`);
                            });

                            return (
                              <>
                                {/* Density Area */}
                                <polygon
                                  points={`40,170 ${pointsDensity.join(' ')} 480,170`}
                                  fill="rgba(0, 210, 255, 0.08)"
                                />
                                {/* Density Line */}
                                <polyline
                                  fill="none"
                                  stroke="var(--accent-blue)"
                                  strokeWidth="2.5"
                                  points={pointsDensity.join(' ')}
                                />

                                {/* Timer Area */}
                                <polygon
                                  points={`40,170 ${pointsTimer.join(' ')} 480,170`}
                                  fill="rgba(16, 185, 129, 0.08)"
                                />
                                {/* Timer Line */}
                                <polyline
                                  fill="none"
                                  stroke="var(--accent-green)"
                                  strokeWidth="2.5"
                                  points={pointsTimer.join(' ')}
                                />

                                {/* Interactive Hover Dots */}
                                {last10.map((t, i) => {
                                  const x = 40 + i * step;
                                  const yD = 170 - (t.trafficDensity / 100) * 150;
                                  const yT = 170 - ((t.calculatedTimer - 10) / 80) * 150;

                                  return (
                                    <g key={t._id || i}
                                      onMouseEnter={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const containerRect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                                        setHoveredData({
                                          density: t.trafficDensity,
                                          timer: t.calculatedTimer,
                                          time: new Date(t.timestamp).toLocaleTimeString(),
                                          source: t.source === 'cv_pipeline' ? 'CV' : 'Manual',
                                          procTime: t.processingTimeMs
                                        });
                                        setTooltipPos({
                                          x: rect.left - containerRect.left + 15,
                                          y: rect.top - containerRect.top - 85
                                        });
                                      }}
                                    >
                                      <circle cx={x} cy={yD} r="5" fill="var(--accent-blue)" stroke="#fff" strokeWidth="1" cursor="pointer" />
                                      <circle cx={x} cy={yT} r="5" fill="var(--accent-green)" stroke="#fff" strokeWidth="1" cursor="pointer" />
                                    </g>
                                  );
                                })}
                              </>
                            );
                          })()}
                        </svg>

                        {/* Chart Legend */}
                        <div className="chart-legend">
                          <div className="legend-item">
                            <span className="legend-color density"></span>
                            <span>Traffic Density (%)</span>
                          </div>
                          <div className="legend-item">
                            <span className="legend-color timer"></span>
                            <span>Green Light Timer (s)</span>
                          </div>
                        </div>

                        {/* Interactive Tooltip */}
                        {hoveredData && (
                          <div className="chart-tooltip" style={{
                            position: 'absolute',
                            left: tooltipPos.x,
                            top: tooltipPos.y,
                            background: 'var(--bg-sidebar)',
                            border: '1px solid var(--border-color-glow)',
                            borderRadius: '8px',
                            padding: '10px',
                            fontSize: '12px',
                            zIndex: 10,
                            pointerEvents: 'none',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
                          }}>
                            <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>Time: {hoveredData.time} ({hoveredData.source})</div>
                            <div style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>Density: {hoveredData.density}%</div>
                            <div style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>Timer: {hoveredData.timer}s</div>
                            <div style={{ color: 'var(--accent-purple)', fontWeight: 'medium' }}>Process: {hoveredData.procTime}ms</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="glass-card">
                  <h3 className="card-title">Parallel Infrastructure</h3>
                  <p className="card-subtitle">Real-time system environment</p>
                  
                  <div className="system-spec-list" style={{ marginTop: '20px' }}>
                    <div className="spec-row">
                      <span>Cores Engine</span>
                      <span className="highlight-text">{pdcStatus ? `${pdcStatus.coresCount} Cores (${pdcStatus.osPlatform})` : 'Detecting...'}</span>
                    </div>
                    <div className="spec-row">
                      <span>CPU Utilization</span>
                      <div className="spec-prog-wrapper">
                        <div className="spec-prog" style={{ width: `${pdcStatus?.cpuUtilization || 0}%` }}></div>
                        <span className="prog-percent">{pdcStatus?.cpuUtilization || 0}%</span>
                      </div>
                    </div>
                    <div className="spec-row">
                      <span>RAM Utilization</span>
                      <div className="spec-prog-wrapper">
                        <div className="spec-prog" style={{ width: `${pdcStatus?.memoryUtilization || 0}%` }}></div>
                        <span className="prog-percent">{pdcStatus?.memoryUtilization || 0}%</span>
                      </div>
                    </div>
                    <div className="spec-row">
                      <span>Active Pipelines</span>
                      <span className="badge badge-purple">{pdcStatus?.activeParallelProcesses || 0} active</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transactions Table Log */}
              <div className="glass-card" style={{ marginTop: '24px' }}>
                <div className="table-header-row">
                  <div>
                    <h3 className="card-title">Transaction Log History</h3>
                    <p className="card-subtitle">Performance records and computed values stored in database</p>
                  </div>
                  <button className="btn btn-secondary btn-danger" onClick={clearAllLogs} disabled={transactions.length === 0}>
                    <Trash2 size={16} />
                    <span>Clear Database Logs</span>
                  </button>
                </div>

                {/* Filters */}
                <div className="filters-container">
                  <input
                    type="text"
                    placeholder="Search by filename..."
                    className="custom-input search-input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  
                  <select
                    className="custom-select"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                  >
                    <option value="all">All Sources</option>
                    <option value="cv_pipeline">CV Pipeline</option>
                    <option value="manual_calculator">Manual Input</option>
                  </select>

                  <select
                    className="custom-select"
                    value={emergencyFilter}
                    onChange={(e) => setEmergencyFilter(e.target.value)}
                  >
                    <option value="all">All Emergencies</option>
                    <option value="normal">Normal Traffic</option>
                    <option value="emergency">Emergency Active</option>
                  </select>
                </div>

                {/* Table */}
                <div className="custom-table-container">
                  {loadingTransactions ? (
                    <div className="table-loader">
                      <RefreshCw size={24} className="icon-pulse" />
                      <p>Loading database logs...</p>
                    </div>
                  ) : processedTransactions.length === 0 ? (
                    <div className="table-loader">
                      <AlertCircle size={24} />
                      <p>No transaction logs match the selected filter criteria.</p>
                    </div>
                  ) : (
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th style={{ cursor: 'pointer' }} onClick={() => handleSort('timestamp')}>
                            Timestamp {sortField === 'timestamp' && (sortDirection === 'asc' ? '▲' : '▼')}
                          </th>
                          <th style={{ cursor: 'pointer' }} onClick={() => handleSort('source')}>
                            Source {sortField === 'source' && (sortDirection === 'asc' ? '▲' : '▼')}
                          </th>
                          <th>Details / Name</th>
                          <th style={{ cursor: 'pointer' }} onClick={() => handleSort('trafficDensity')}>
                            Density {sortField === 'trafficDensity' && (sortDirection === 'asc' ? '▲' : '▼')}
                          </th>
                          <th style={{ cursor: 'pointer' }} onClick={() => handleSort('emergencyStatus')}>
                            Emergency {sortField === 'emergencyStatus' && (sortDirection === 'asc' ? '▲' : '▼')}
                          </th>
                          <th style={{ cursor: 'pointer' }} onClick={() => handleSort('calculatedTimer')}>
                            Green Timer {sortField === 'calculatedTimer' && (sortDirection === 'asc' ? '▲' : '▼')}
                          </th>
                          <th style={{ cursor: 'pointer' }} onClick={() => handleSort('processingTimeMs')}>
                            Runtime {sortField === 'processingTimeMs' && (sortDirection === 'asc' ? '▲' : '▼')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {processedTransactions.map((t) => (
                          <tr key={t._id}>
                            <td>{new Date(t.timestamp).toLocaleString()}</td>
                            <td>
                              <span className={`badge ${t.source === 'cv_pipeline' ? 'badge-blue' : 'badge-purple'}`}>
                                {t.source === 'cv_pipeline' ? 'CV PIPELINE' : 'MANUAL'}
                              </span>
                            </td>
                            <td>
                              {t.source === 'cv_pipeline' ? (
                                <div className="file-detail">
                                  <span className="file-name" title={t.fileName}>{t.fileName}</span>
                                  <span className="vehicles-summary">
                                    ({t.vehicleCount?.cars}🚗, {t.vehicleCount?.trucks}🚚, {t.vehicleCount?.ambulances}🚑)
                                  </span>
                                </div>
                              ) : (
                                <span className="text-secondary">-</span>
                              )}
                            </td>
                            <td>{t.trafficDensity}%</td>
                            <td>
                              <span className={`badge ${t.emergencyStatus === 'emergency' ? 'badge-red' : 'badge-green'}`}>
                                {t.emergencyStatus.toUpperCase()}
                              </span>
                            </td>
                            <td className="highlight-text">{t.calculatedTimer}s</td>
                            <td>{t.processingTimeMs}ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CV PIPELINE */}
          {activeTab === 'cv' && (
            <div className="tab-pane fade-in">
              <div className="cv-pipeline-layout">
                {/* Input Side */}
                <div className="glass-card">
                  <h3 className="card-title">1. Select Image Source</h3>
                  <p className="card-subtitle">Upload a local file or paste any public image URL (e.g. Google Images) to run the CV pipeline</p>

                  {/* Mode switcher tabs */}
                  <div className="cv-mode-switcher">
                    <button
                      className={`cv-mode-btn ${cvInputMode === 'upload' ? 'active' : ''}`}
                      onClick={() => { setCvInputMode('upload'); setCvError(null); setCvResult(null); }}
                    >
                      <Upload size={15} />
                      <span>Upload File</span>
                    </button>
                    <button
                      className={`cv-mode-btn ${cvInputMode === 'url' ? 'active' : ''}`}
                      onClick={() => { setCvInputMode('url'); setCvError(null); setCvResult(null); }}
                    >
                      <ArrowRight size={15} />
                      <span>Image URL</span>
                    </button>
                  </div>

                  {/* ── UPLOAD MODE ── */}
                  {cvInputMode === 'upload' && (
                    <>
                      <div className="upload-dropzone" onClick={() => fileInputRef.current.click()}>
                        <Upload size={32} className="upload-icon" />
                        {selectedFile ? (
                          <div className="selected-file-info">
                            <span className="file-name">{selectedFile.name}</span>
                            <span className="file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                          </div>
                        ) : (
                          <p>Drag & drop or click to choose file</p>
                        )}
                        <input
                          type="file"
                          ref={fileInputRef}
                          style={{ display: 'none' }}
                          accept="image/*"
                          onChange={handleFileChange}
                        />
                      </div>

                      <div className="btn-group-center" style={{ marginTop: '20px' }}>
                        <button
                          className="btn btn-primary"
                          onClick={triggerUpload}
                          disabled={!selectedFile || isProcessingCv}
                        >
                          {isProcessingCv ? <RefreshCw size={16} className="icon-pulse" /> : <Play size={16} />}
                          <span>{isProcessingCv ? 'Processing Pipeline...' : 'Run CV Analysis'}</span>
                        </button>
                      </div>

                      {/* Preloaded Samples */}
                      <div className="sample-images-section">
                        <h4 className="section-title">Or choose a preloaded sample scenario:</h4>
                        <div className="sample-grid">
                          <div className="sample-card" onClick={() => processSample('/heavy_traffic.jpg', 'heavy_traffic.jpg')}>
                            <span className="sample-title">Heavy Traffic Load</span>
                            <span className="sample-meta">15+ Vehicles, High Density</span>
                          </div>
                          <div className="sample-card" onClick={() => processSample('/emergency_vehicle.jpg', 'emergency_vehicle.jpg')}>
                            <span className="sample-title">Emergency Priority</span>
                            <span className="sample-meta">Ambulance, Lights Flashing</span>
                          </div>
                          <div className="sample-card" onClick={() => processSample('/empty_intersection.jpg', 'empty_intersection.jpg')}>
                            <span className="sample-title">Light Intersection</span>
                            <span className="sample-meta">2 Cars, Clear Road</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── URL MODE ── */}
                  {cvInputMode === 'url' && (
                    <>
                      {/* URL input card */}
                      <div className="url-card">
                        <div className="url-card-icon"><ArrowRight size={20} /></div>
                        <div className="url-card-body">
                          <p className="url-card-title">Enter Public Image URL</p>
                          <p className="url-card-sub">Works with any direct image link (.jpg, .png, .webp)</p>
                        </div>
                      </div>

                      <div className="url-input-section">
                        <div className="url-input-row">
                          <input
                            type="url"
                            className="custom-input"
                            placeholder="https://upload.wikimedia.org/...traffic.jpg"
                            value={imageUrlInput}
                            onChange={(e) => {
                              setImageUrlInput(e.target.value);
                              setUrlPreviewSrc(null);
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') analyzeImageUrl(); }}
                          />
                        </div>
                        <div className="url-actions-row">
                          <button
                            className="btn-url-preview"
                            onClick={() => setUrlPreviewSrc(imageUrlInput.trim())}
                            disabled={!imageUrlInput.trim()}
                          >
                            <CheckCircle size={14} />
                            <span>Preview Image</span>
                          </button>
                          <span className="url-input-hint">💡 Right-click image on Google → "Copy image address"</span>
                        </div>
                      </div>

                      {/* URL Image Preview */}
                      {urlPreviewSrc && (
                        <div className="url-preview-box">
                          <div className="url-preview-header">
                            <span className="box-title">Image Preview</span>
                            <button className="url-preview-clear" onClick={() => { setUrlPreviewSrc(null); setImageUrlInput(''); }}>
                              ✕ Clear
                            </button>
                          </div>
                          <div className="image-frame" style={{ aspectRatio: '16/9' }}>
                            <img
                              src={urlPreviewSrc}
                              alt="URL Preview"
                              onError={() => setCvError('Could not load image preview. The URL may be blocked or invalid.')}
                            />
                          </div>
                        </div>
                      )}

                      <div className="btn-group-center" style={{ marginTop: '20px' }}>
                        <button
                          className="btn btn-primary"
                          onClick={analyzeImageUrl}
                          disabled={!imageUrlInput.trim() || isProcessingCv}
                          style={{ width: '100%' }}
                        >
                          {isProcessingCv ? <RefreshCw size={16} className="icon-pulse" /> : <Play size={16} />}
                          <span>{isProcessingCv ? 'Downloading & Processing...' : 'Analyze Image from URL'}</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Execution and Output Side */}
                <div className="glass-card">
                  <h3 className="card-title">2. Processing Results</h3>
                  
                  {isProcessingCv && (
                    <div className="cv-status-loading">
                      <RefreshCw size={40} className="icon-pulse blue-glow-text" />
                      <h4 style={{ marginTop: '16px' }}>{cvStatusMessage || 'Triggering pipelines...'}</h4>
                      <p className="text-secondary">Parallel Python Bridge: Spawning YOLOv8 engine on server CPU cores</p>
                    </div>
                  )}

                  {!isProcessingCv && !cvResult && !cvError && (
                    <div className="empty-results-placeholder">
                      <Cpu size={48} className="text-muted" />
                      <p>Waiting for analysis trigger.</p>
                      <p className="text-secondary">Select an image to feed the object recognition model.</p>
                    </div>
                  )}

                  {cvError && (
                    <div className="pipeline-error-box">
                      <AlertTriangle size={32} className="error-icon" />
                      <h4>Pipeline Interrupted</h4>
                      <p className="error-desc">{cvError}</p>
                      <div className="fallback-note">
                        <CheckCircle size={14} className="text-green" />
                        <span>The system automatically falls back to analytical simulation if Python dependencies are missing, but this error prevented a response. Make sure the Node server has permission.</span>
                      </div>
                    </div>
                  )}

                  {cvResult && (
                    <div className="cv-results-view">
                      <div className="image-comparison-grid">
                        <div className="comparison-box">
                          <span className="box-title">Source Snapshot</span>
                          <div className="image-frame">
                            <img src={previewUrl} alt="Source" />
                          </div>
                        </div>
                        <div className="comparison-box">
                          <span className="box-title">YOLOv8 Classified Output</span>
                          <div className="image-frame processed">
                            <img src={`${API_BASE}${cvResult.transaction.processedPath}`} alt="Processed YOLO Detections" />
                          </div>
                        </div>
                      </div>

                      {/* Analysis Details */}
                      <div className="cv-details-cards">
                        <div className="metric-detail-card">
                          <span className="card-lbl">Detected Vehicles</span>
                          <div className="counts-row">
                            <div className="count-item">
                              <span className="count-badge car">Cars</span>
                              <span className="count-val">{cvResult.cvDetails.cars}</span>
                            </div>
                            <div className="count-item">
                              <span className="count-badge truck">Trucks</span>
                              <span className="count-val">{cvResult.cvDetails.trucks}</span>
                            </div>
                            <div className="count-item">
                              <span className="count-badge ambulance">Ambulances</span>
                              <span className="count-val text-red">{cvResult.cvDetails.ambulances}</span>
                            </div>
                          </div>
                        </div>

                        <div className="metric-detail-grid">
                          <div className="mini-metric">
                            <span className="mini-lbl">Computed Density</span>
                            <span className="mini-val">{cvResult.transaction.trafficDensity}%</span>
                          </div>
                          <div className="mini-metric">
                            <span className="mini-lbl">Fuzzy Output Timer</span>
                            <span className="mini-val text-green">{cvResult.transaction.calculatedTimer}s</span>
                          </div>
                          <div className="mini-metric">
                            <span className="mini-lbl">Pipeline Runtime</span>
                            <span className="mini-val text-purple">{cvResult.transaction.processingTimeMs}ms</span>
                          </div>
                        </div>

                        {cvResult.cvDetails.fallback && (
                          <div className="fallback-badge-info">
                            <Sparkles size={14} />
                            <span>Run successfully via local analytical simulator (YOLO library missing on host machine, using fallback mode)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FUZZY CALCULATOR */}
          {activeTab === 'fuzzy' && (
            <div className="tab-pane fade-in">
              <div className="fuzzy-calculator-layout">
                {/* Inputs */}
                <div className="glass-card">
                  <h3 className="card-title">1. Fuzzy Variable Inputs</h3>
                  <p className="card-subtitle">Set manual values for traffic density and emergency vehicle status to calculate the optimal green light timer</p>

                  <div className="calculator-form" style={{ marginTop: '24px' }}>
                    {/* Density Input */}
                    <div className="input-group">
                      <div className="input-header-labels">
                        <label className="input-label">Traffic Density (%)</label>
                        <span className="input-val-highlight">{densitySlider}%</span>
                      </div>
                      
                      <div className="slider-container">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={densitySlider}
                          onChange={(e) => setDensitySlider(parseInt(e.target.value))}
                        />
                        <div className="slider-scale-labels">
                          <span>0% (Empty)</span>
                          <span>50% (Medium)</span>
                          <span>100% (Saturated)</span>
                        </div>
                      </div>
                    </div>

                    {/* Emergency Input */}
                    <div className="input-group" style={{ marginTop: '30px' }}>
                      <label className="input-label">Emergency Vehicle Status</label>
                      <p className="card-subtitle">Does the lane have an active ambulance, fire truck, or police siren?</p>
                      
                      <div className="toggle-switch-wrapper" style={{ marginTop: '10px' }}>
                        <button
                          className={`toggle-option ${!emergencyToggle ? 'active' : ''}`}
                          onClick={() => setEmergencyToggle(false)}
                        >
                          No Emergency (Normal)
                        </button>
                        <button
                          className={`toggle-option emergency ${emergencyToggle ? 'active' : ''}`}
                          onClick={() => setEmergencyToggle(true)}
                        >
                          Emergency Active (Ambulance 🚨)
                        </button>
                      </div>
                    </div>

                    <button
                      className="btn btn-primary"
                      style={{ marginTop: '40px', width: '100%' }}
                      onClick={calculateManualFuzzy}
                      disabled={isCalculatingFuzzy}
                    >
                      {isCalculatingFuzzy ? <RefreshCw size={16} className="icon-pulse" /> : <Play size={16} />}
                      <span>{isCalculatingFuzzy ? 'Evaluating Engine...' : 'Run Defuzzification'}</span>
                    </button>
                  </div>
                </div>

                {/* Outputs */}
                <div className="glass-card">
                  <h3 className="card-title">2. Controller Decision Output</h3>
                  
                  {isCalculatingFuzzy && (
                    <div className="cv-status-loading">
                      <RefreshCw size={40} className="icon-pulse text-green" />
                      <h4 style={{ marginTop: '16px' }}>Defuzzifying...</h4>
                      <p className="text-secondary">Evaluating Mamdani Rules in Python child process</p>
                    </div>
                  )}

                  {!isCalculatingFuzzy && !fuzzyResult && !fuzzyError && (
                    <div className="empty-results-placeholder">
                      <Sliders size={48} className="text-muted" />
                      <p>Adjust inputs and click defuzzify.</p>
                      <p className="text-secondary">Calculations are powered by scikit-fuzzy / Centroid fallbacks.</p>
                    </div>
                  )}

                  {fuzzyError && (
                    <div className="pipeline-error-box">
                      <AlertTriangle size={32} className="error-icon" />
                      <h4>Calculation Failed</h4>
                      <p className="error-desc">{fuzzyError}</p>
                    </div>
                  )}

                  {fuzzyResult && (
                    <div className="fuzzy-outputs-view">
                      {/* Timer Circular Display */}
                      <div className="timer-consequent-circle">
                        <div className="circle-inner">
                          <span className="timer-unit-label">Calculated Green Time</span>
                          <span className="timer-seconds-big">{fuzzyResult.fuzzyDetails.calculated_timer}s</span>
                          <span className="timer-rule-priority">
                            {fuzzyResult.transaction.emergencyStatus === 'emergency' ? '🚨 EMERGENCY OVERRIDE' : 'NORMAL TRAFFIC FLOW'}
                          </span>
                        </div>
                      </div>

                      {/* Rule Executions */}
                      <div className="rules-fired-card">
                        <h4 className="section-title">Membership Strengths</h4>
                        
                        <div className="fuzzy-sets-row">
                          <div className="fuzzy-set-box">
                            <span className="set-box-title">Traffic Density</span>
                            <div className="set-item">
                              <span>Low:</span>
                              <span className="set-bar-wrap">
                                <span className="set-bar" style={{ width: `${(fuzzyResult.fuzzyDetails.memberships?.density?.low || 0) * 100}%` }}></span>
                              </span>
                              <span>{fuzzyResult.fuzzyDetails.memberships?.density?.low || 0}</span>
                            </div>
                            <div className="set-item">
                              <span>Medium:</span>
                              <span className="set-bar-wrap">
                                <span className="set-bar" style={{ width: `${(fuzzyResult.fuzzyDetails.memberships?.density?.medium || 0) * 100}%` }}></span>
                              </span>
                              <span>{fuzzyResult.fuzzyDetails.memberships?.density?.medium || 0}</span>
                            </div>
                            <div className="set-item">
                              <span>High:</span>
                              <span className="set-bar-wrap">
                                <span className="set-bar" style={{ width: `${(fuzzyResult.fuzzyDetails.memberships?.density?.high || 0) * 100}%` }}></span>
                              </span>
                              <span>{fuzzyResult.fuzzyDetails.memberships?.density?.high || 0}</span>
                            </div>
                          </div>

                          <div className="fuzzy-set-box">
                            <span className="set-box-title">Emergency State</span>
                            <div className="set-item">
                              <span>Normal:</span>
                              <span className="set-bar-wrap">
                                <span className="set-bar" style={{ width: `${(fuzzyResult.fuzzyDetails.memberships?.emergency?.normal || 0) * 100}%` }}></span>
                              </span>
                              <span>{fuzzyResult.fuzzyDetails.memberships?.emergency?.normal || 0}</span>
                            </div>
                            <div className="set-item">
                              <span>Active:</span>
                              <span className="set-bar-wrap">
                                <span className="set-bar" style={{ width: `${(fuzzyResult.fuzzyDetails.memberships?.emergency?.active || 0) * 100}%` }}></span>
                              </span>
                              <span>{fuzzyResult.fuzzyDetails.memberships?.emergency?.active || 0}</span>
                            </div>
                          </div>
                        </div>

                        {fuzzyResult.fuzzyDetails.error_info && (
                          <div className="fallback-badge-info" style={{ marginTop: '16px' }}>
                            <Sparkles size={14} />
                            <span>Calculated via high-speed pure-python fallback.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PDC MONITOR */}
          {activeTab === 'pdc' && (
            <div className="tab-pane fade-in">
              <div className="pdc-layout">
                {/* Resource Metrics Card */}
                <div className="glass-card">
                  <h3 className="card-title">Multi-Core Process Load Balancing</h3>
                  <p className="card-subtitle">Visualizing process thread allocations across the CPU cores during parallel execution</p>
                  
                  {pdcStatus ? (
                    <div className="pdc-monitors-container">
                      {/* Grid of cores */}
                      <div className="cpu-cores-grid">
                        {Array.from({ length: pdcStatus.coresCount || 4 }).map((_, i) => {
                          // Add slight variance to make core display dynamic and interesting
                          const coreLoad = Math.max(5, Math.min(95, Math.round(pdcStatus.cpuUtilization + (Math.sin(i + Date.now() / 1000) * 8))));
                          return (
                            <div key={i} className="core-box">
                              <span className="core-lbl">Core {i + 1}</span>
                              <span className="core-val">{coreLoad}%</span>
                              <div className="core-prog">
                                <div className="core-prog-bar" style={{ 
                                  height: `${coreLoad}%`,
                                  background: coreLoad > 80 ? 'var(--accent-red)' : coreLoad > 50 ? 'var(--accent-yellow)' : 'var(--accent-blue)'
                                }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Memory & System Info */}
                      <div className="sys-monitors-row">
                        <div className="mon-card">
                          <span className="mon-lbl">RAM Usage</span>
                          <span className="mon-val">
                            {(parseFloat(pdcStatus.totalMemoryGB) - parseFloat(pdcStatus.freeMemoryGB)).toFixed(2)} GB / {pdcStatus.totalMemoryGB} GB
                          </span>
                          <div className="mon-bar">
                            <div className="mon-fill" style={{ width: `${pdcStatus.memoryUtilization}%` }}></div>
                          </div>
                        </div>

                        <div className="mon-card">
                          <span className="mon-lbl">Active Spawns</span>
                          <span className="mon-val text-purple">{pdcStatus.activeParallelProcesses} Processes</span>
                          <p className="mon-desc">Subprocesses spawned concurrently to run YOLO and fuzzy logic modules concurrently without blocking the Express event loop.</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="table-loader">
                      <RefreshCw size={24} className="icon-pulse" />
                      <p>Connecting to PDC Monitor...</p>
                    </div>
                  )}
                </div>

                {/* Subprocess System Logs Console */}
                <div className="glass-card console-card">
                  <h3 className="card-title">Execution Console Output</h3>
                  <p className="card-subtitle">Real-time shell spawning log streams from Python / Node child process wrapper</p>
                  
                  <div className="console-wrapper">
                    <div className="console-header">
                      <div className="console-dots">
                        <span className="dot dot-red"></span>
                        <span className="dot dot-yellow"></span>
                        <span className="dot dot-green"></span>
                      </div>
                      <span className="console-title">pdc_bridge_sys.log</span>
                    </div>
                    <div className="console-body">
                      {pdcLogs.map((log) => (
                        <div key={log.id} className="console-line">
                          <span className="log-time">[{log.time}]</span>
                          <span className="log-text">{log.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Fuzzy Logic Explainer Card ── */}
                <div className="glass-card fuzzy-explainer-card">
                  <h3 className="card-title">⚙️ How Fuzzy Logic Works in This System</h3>
                  <p className="card-subtitle">End-to-end pipeline from image capture to green light decision</p>

                  {/* Pipeline Flow */}
                  <div className="fuzzy-pipeline">
                    <div className="fz-step blue">
                      <div className="fz-step-num">01</div>
                      <div className="fz-step-icon">📸</div>
                      <div className="fz-step-content">
                        <span className="fz-step-title">CV Detection (YOLOv8)</span>
                        <span className="fz-step-desc">Traffic image is analyzed. Cars, trucks &amp; ambulances are detected and counted using the YOLOv8 deep learning model.</span>
                      </div>
                    </div>
                    <div className="fz-arrow">▼</div>

                    <div className="fz-step purple">
                      <div className="fz-step-num">02</div>
                      <div className="fz-step-icon">📊</div>
                      <div className="fz-step-content">
                        <span className="fz-step-title">Density Calculation</span>
                        <span className="fz-step-desc">Traffic density score is computed: <code>Cars × 6% + Trucks × 12%</code> (capped at 100%). Emergency = 1.0 if ambulance detected.</span>
                      </div>
                    </div>
                    <div className="fz-arrow">▼</div>

                    <div className="fz-step green">
                      <div className="fz-step-num">03</div>
                      <div className="fz-step-icon">🔀</div>
                      <div className="fz-step-content">
                        <span className="fz-step-title">Fuzzification</span>
                        <span className="fz-step-desc">Crisp inputs are converted into fuzzy membership values using triangular membership functions (Low / Medium / High for density; Normal / Active for emergency).</span>
                      </div>
                    </div>
                    <div className="fz-arrow">▼</div>

                    <div className="fz-step yellow">
                      <div className="fz-step-num">04</div>
                      <div className="fz-step-icon">📋</div>
                      <div className="fz-step-content">
                        <span className="fz-step-title">Rule Evaluation (Mamdani)</span>
                        <span className="fz-step-desc">4 IF-THEN rules fire simultaneously. Rule 4 (Emergency Active → Long timer) always overrides all others for ambulance priority.</span>
                      </div>
                    </div>
                    <div className="fz-arrow">▼</div>

                    <div className="fz-step red">
                      <div className="fz-step-num">05</div>
                      <div className="fz-step-icon">🎯</div>
                      <div className="fz-step-content">
                        <span className="fz-step-title">Defuzzification (Centroid)</span>
                        <span className="fz-step-desc">Aggregated fuzzy output is collapsed to a single crisp value (10s – 90s) using the Centroid method — the center of gravity of the output area.</span>
                      </div>
                    </div>
                    <div className="fz-arrow">▼</div>

                    <div className="fz-step blue fz-output">
                      <div className="fz-step-num">✓</div>
                      <div className="fz-step-icon">🚦</div>
                      <div className="fz-step-content">
                        <span className="fz-step-title">Green Light Timer Output</span>
                        <span className="fz-step-desc">Final computed timer (e.g. <strong>45s</strong>) is returned to the frontend and logged as a transaction. Signal controller uses this value to set the intersection timing.</span>
                      </div>
                    </div>
                  </div>

                  {/* Rules quick reference */}
                  <div className="fz-rules-grid">
                    <h4 className="section-title" style={{ marginBottom: '12px' }}>Fuzzy Rule Base</h4>
                    <div className="fz-rule-row">
                      <span className="fz-rule-badge blue">R1</span>
                      <span className="fz-rule-text">IF Density is <strong>Low</strong> AND Emergency is <strong>Normal</strong> → Timer is <strong>Short</strong> (10–35s)</span>
                    </div>
                    <div className="fz-rule-row">
                      <span className="fz-rule-badge purple">R2</span>
                      <span className="fz-rule-text">IF Density is <strong>Medium</strong> AND Emergency is <strong>Normal</strong> → Timer is <strong>Medium</strong> (25–75s)</span>
                    </div>
                    <div className="fz-rule-row">
                      <span className="fz-rule-badge green">R3</span>
                      <span className="fz-rule-text">IF Density is <strong>High</strong> AND Emergency is <strong>Normal</strong> → Timer is <strong>Long</strong> (65–90s)</span>
                    </div>
                    <div className="fz-rule-row">
                      <span className="fz-rule-badge red">R4</span>
                      <span className="fz-rule-text">IF Emergency is <strong>Active</strong> (any density) → Timer is <strong>Long</strong> 🚨 <em>Priority Override</em></span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
