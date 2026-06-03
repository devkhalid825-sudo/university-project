import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import Transaction from './models/Transaction.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001; // Changed to avoid EADDRINUSE

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Ensure directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PROCESSED_DIR = path.join(__dirname, 'processed');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(PROCESSED_DIR)) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

// Serve static assets
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/processed', express.static(PROCESSED_DIR));

// Memory fallback database for transactions (if MongoDB is offline)
let localTransactions = [];
let isMongoConnected = false;

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_city_traffic';
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB at:', MONGODB_URI);
    isMongoConnected = true;
  })
  .catch((err) => {
    console.warn('\n⚠️ WARNING: Could not connect to MongoDB. Fallback to In-Memory storage active.');
    console.warn('Make sure MongoDB is running if you want persistence.\n');
    isMongoConnected = false;
  });

// Track active parallel processes (PDC)
let activeProcessCount = 0;

const PYTHON_SERVICE_URL = 'http://127.0.0.1:5002';

// Start the persistent Python service
let pythonServiceProcess = null;
const startPythonService = () => {
  const pythonServicePath = path.join(__dirname, 'python_service.py');
  console.log(`Starting persistent Python service: python ${pythonServicePath}`);
  
  pythonServiceProcess = spawn('python', [pythonServicePath]);
  
  pythonServiceProcess.stdout.on('data', (data) => {
    console.log(`[Python Service stdout]: ${data.toString().trim()}`);
  });
  
  pythonServiceProcess.stderr.on('data', (data) => {
    console.error(`[Python Service stderr]: ${data.toString().trim()}`);
  });
  
  pythonServiceProcess.on('close', (code) => {
    console.log(`Python Service exited with code ${code}`);
    if (code !== null && code !== 0) {
      console.log('Restarting Python Service in 5 seconds...');
      setTimeout(startPythonService, 5000);
    }
  });
};

startPythonService();

// Clean up when Node exits
const cleanupPythonService = () => {
  if (pythonServiceProcess) {
    console.log('Stopping Python service...');
    pythonServiceProcess.kill('SIGTERM');
    pythonServiceProcess = null;
  }
};

process.on('exit', cleanupPythonService);
process.on('SIGINT', () => {
  cleanupPythonService();
  process.exit();
});
process.on('SIGTERM', () => {
  cleanupPythonService();
  process.exit();
});

// Helper function to spawn a Python script asynchronously (Fallback Mode)
const runPythonScript = (scriptName, args) => {
  return new Promise((resolve, reject) => {
    activeProcessCount++;
    const scriptPath = path.join(__dirname, scriptName);
    
    // On Windows, use 'python' to execute. If python isn't found, child_process throws error.
    console.log(`Spawning parallel process: python ${scriptName} ${args.join(' ')}`);
    const pyProcess = spawn('python', [scriptPath, ...args]);
    
    let stdoutData = '';
    let stderrData = '';
    
    pyProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    pyProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    pyProcess.on('close', (code) => {
      activeProcessCount = Math.max(0, activeProcessCount - 1);
      
      if (code !== 0) {
        console.error(`Python script ${scriptName} exited with code ${code}. Stderr: ${stderrData}`);
        return reject(new Error(stderrData || `Script exited with code ${code}`));
      }
      
      try {
        // Extract the first JSON object from stdout (ignore any preceding logs)
        const jsonStart = stdoutData.indexOf('{');
        const jsonEnd = stdoutData.lastIndexOf('}') + 1;
        const jsonString = jsonStart !== -1 && jsonEnd !== -1 ? stdoutData.slice(jsonStart, jsonEnd) : stdoutData;
        const jsonResult = JSON.parse(jsonString);
        resolve(jsonResult);
      } catch (err) {
        console.error('Failed to parse Python JSON output:', stdoutData);
        reject(new Error('Invalid JSON output from Python script'));
      }
    });
    
    pyProcess.on('error', (err) => {
      activeProcessCount = Math.max(0, activeProcessCount - 1);
      console.error(`Failed to start Python process: ${err.message}`);
      reject(new Error(`Python process error: ${err.message}. Make sure Python is in your PATH.`));
    });
  });
};

// Set up Multer storage for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

/* ==========================================================================
   MODULE 2 ROUTES
   ========================================================================== */

// 1. /api/cv/upload: Handles image uploads, runs CV pipeline, then runs Fuzzy logic
app.post('/api/cv/upload', upload.single('trafficImage'), async (req, res) => {
  const startTime = Date.now();
  
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }
  
  try {
    const inputPath = req.file.path;
    let cvResult;
    
    // Attempt to query the persistent Python service
    try {
      console.log('Sending CV task to persistent Python service...');
      const response = await fetch(`${PYTHON_SERVICE_URL}/cv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_path: inputPath, output_dir: PROCESSED_DIR })
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      cvResult = await response.json();
      console.log('CV task completed by persistent service.');
    } catch (err) {
      console.warn('Persistent Python service CV request failed, falling back to process spawning:', err.message);
      // Fallback: spawn separate process
      cvResult = await runPythonScript('cv_processor.py', [inputPath, PROCESSED_DIR]);
    }
    
    if (!cvResult.success) {
      throw new Error(cvResult.error || 'Computer Vision processing failed');
    }
    
    // Step B: Calculate Traffic Density and Emergency Status based on counts
    // Formula for Traffic Density score (0-100%):
    // Cars count as 6% density, trucks count as 12% density
    const calculatedDensity = Math.min(100, (cvResult.cars * 6) + (cvResult.trucks * 12));
    const emergencyStatus = cvResult.ambulances > 0 ? 'emergency' : 'normal';
    
    let fuzzyResult;
    
    // Attempt to query the persistent Python service for Fuzzy
    try {
      console.log('Sending Fuzzy task to persistent Python service...');
      const response = await fetch(`${PYTHON_SERVICE_URL}/fuzzy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traffic_density: calculatedDensity, emergency_status: emergencyStatus })
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      fuzzyResult = await response.json();
      console.log('Fuzzy task completed by persistent service.');
    } catch (err) {
      console.warn('Persistent Python service Fuzzy request failed, falling back to process spawning:', err.message);
      // Fallback: spawn separate process
      fuzzyResult = await runPythonScript('fuzzy_processor.py', [
        calculatedDensity.toString(), 
        emergencyStatus
      ]);
    }
    
    const processingTimeMs = Date.now() - startTime;
    
    // Step D: Create transaction log record
    const transactionData = {
      source: 'cv_pipeline',
      fileName: req.file.originalname,
      filePath: `/uploads/${req.file.filename}`,
      processedPath: `/processed/${cvResult.processed_image}`,
      vehicleCount: {
        cars: cvResult.cars,
        trucks: cvResult.trucks,
        ambulances: cvResult.ambulances,
        total: cvResult.total
      },
      trafficDensity: Math.round(calculatedDensity),
      emergencyStatus,
      calculatedTimer: fuzzyResult.calculated_timer,
      processingTimeMs
    };
    
    let savedTransaction;
    if (isMongoConnected) {
      savedTransaction = await Transaction.create(transactionData);
    } else {
      // In-Memory Database Fallback
      savedTransaction = { _id: 'local_' + Date.now(), ...transactionData, timestamp: new Date() };
      localTransactions.unshift(savedTransaction);
    }
    
    return res.json({
      success: true,
      transaction: savedTransaction,
      cvDetails: cvResult,
      fuzzyDetails: fuzzyResult
    });
    
  } catch (error) {
    console.error('CV Upload Route error:', error);
    return res.status(500).json({ 
      error: 'An error occurred during CV and Fuzzy computation',
      message: error.message
    });
  }
});

// 1b. /api/cv/url: Downloads image from a URL, then runs the same CV+Fuzzy pipeline
app.post('/api/cv/url', async (req, res) => {
  const startTime = Date.now();
  const { imageUrl } = req.body;

  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid imageUrl field' });
  }

  // Basic URL validation
  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP/HTTPS URLs are allowed');
    }
  } catch (err) {
    return res.status(400).json({ error: `Invalid URL: ${err.message}` });
  }

  // Derive file extension from URL pathname (default to .jpg)
  const rawExt = path.extname(parsedUrl.pathname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'];
  const ext = allowedExts.includes(rawExt) ? rawExt : '.jpg';
  const uniqueName = `url_${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
  const savedPath = path.join(UPLOADS_DIR, uniqueName);

  try {
    // Fetch the image with a 15-second timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let fetchRes;
    try {
      fetchRes = await fetch(imageUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!fetchRes.ok) {
      return res.status(502).json({ error: `Could not fetch image from URL (HTTP ${fetchRes.status})` });
    }

    const contentType = fetchRes.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: `URL does not point to an image (Content-Type: ${contentType})` });
    }

    // Save the image buffer to uploads dir
    const arrayBuf = await fetchRes.arrayBuffer();
    fs.writeFileSync(savedPath, Buffer.from(arrayBuf));

    // ── CV Processing ──────────────────────────────────────────────────────
    let cvResult;
    try {
      console.log('Sending URL-sourced image CV task to persistent Python service...');
      const response = await fetch(`${PYTHON_SERVICE_URL}/cv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_path: savedPath, output_dir: PROCESSED_DIR })
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      cvResult = await response.json();
    } catch (err) {
      console.warn('Persistent Python service CV request failed, falling back:', err.message);
      cvResult = await runPythonScript('cv_processor.py', [savedPath, PROCESSED_DIR]);
    }

    if (!cvResult.success) {
      throw new Error(cvResult.error || 'Computer Vision processing failed');
    }

    // ── Fuzzy Processing ───────────────────────────────────────────────────
    const calculatedDensity = Math.min(100, (cvResult.cars * 6) + (cvResult.trucks * 12));
    const emergencyStatus = cvResult.ambulances > 0 ? 'emergency' : 'normal';

    let fuzzyResult;
    try {
      const response = await fetch(`${PYTHON_SERVICE_URL}/fuzzy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traffic_density: calculatedDensity, emergency_status: emergencyStatus })
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      fuzzyResult = await response.json();
    } catch (err) {
      fuzzyResult = await runPythonScript('fuzzy_processor.py', [calculatedDensity.toString(), emergencyStatus]);
    }

    const processingTimeMs = Date.now() - startTime;

    // ── Transaction Log ────────────────────────────────────────────────────
    const originalName = decodeURIComponent(path.basename(parsedUrl.pathname)) || uniqueName;
    const transactionData = {
      source: 'cv_pipeline',
      fileName: originalName,
      filePath: `/uploads/${uniqueName}`,
      processedPath: `/processed/${cvResult.processed_image}`,
      vehicleCount: {
        cars: cvResult.cars,
        trucks: cvResult.trucks,
        ambulances: cvResult.ambulances,
        total: cvResult.total
      },
      trafficDensity: Math.round(calculatedDensity),
      emergencyStatus,
      calculatedTimer: fuzzyResult.calculated_timer,
      processingTimeMs
    };

    let savedTransaction;
    if (isMongoConnected) {
      savedTransaction = await Transaction.create(transactionData);
    } else {
      savedTransaction = { _id: 'local_' + Date.now(), ...transactionData, timestamp: new Date() };
      localTransactions.unshift(savedTransaction);
    }

    return res.json({
      success: true,
      transaction: savedTransaction,
      cvDetails: cvResult,
      fuzzyDetails: fuzzyResult
    });

  } catch (error) {
    // Clean up saved file on error
    if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
    console.error('CV URL Route error:', error);
    return res.status(500).json({
      error: 'An error occurred during URL image CV computation',
      message: error.message
    });
  }
});

// 2. /api/fuzzy/calculate: Handles manual inputs and returns Fuzzy computations
app.post('/api/fuzzy/calculate', async (req, res) => {
  const startTime = Date.now();
  const { trafficDensity, emergencyStatus } = req.body;
  
  if (trafficDensity === undefined || !emergencyStatus) {
    return res.status(400).json({ error: 'Missing trafficDensity or emergencyStatus fields' });
  }
  
  try {
    const densityVal = parseFloat(trafficDensity);
    const emergVal = emergencyStatus === 'emergency' ? 'emergency' : 'normal';
    
    let fuzzyResult;
    
    // Attempt to query the persistent Python service for Fuzzy
    try {
      console.log('Sending manual Fuzzy task to persistent Python service...');
      const response = await fetch(`${PYTHON_SERVICE_URL}/fuzzy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traffic_density: densityVal, emergency_status: emergVal })
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      fuzzyResult = await response.json();
      console.log('Fuzzy task completed by persistent service.');
    } catch (err) {
      console.warn('Persistent Python service Fuzzy request failed, falling back to process spawning:', err.message);
      // Fallback: spawn separate process
      fuzzyResult = await runPythonScript('fuzzy_processor.py', [
        densityVal.toString(),
        emergVal
      ]);
    }
    
    const processingTimeMs = Date.now() - startTime;
    
    // Create transaction log
    const transactionData = {
      source: 'manual_calculator',
      trafficDensity: densityVal,
      emergencyStatus: emergVal,
      calculatedTimer: fuzzyResult.calculated_timer,
      processingTimeMs,
      vehicleCount: {
        cars: 0,
        trucks: 0,
        ambulances: emergVal === 'emergency' ? 1 : 0,
        total: emergVal === 'emergency' ? 1 : 0
      }
    };
    
    let savedTransaction;
    if (isMongoConnected) {
      savedTransaction = await Transaction.create(transactionData);
    } else {
      savedTransaction = { _id: 'local_' + Date.now(), ...transactionData, timestamp: new Date() };
      localTransactions.unshift(savedTransaction);
    }
    
    return res.json({
      success: true,
      transaction: savedTransaction,
      fuzzyDetails: fuzzyResult
    });
    
  } catch (error) {
    console.error('Fuzzy calculation Route error:', error);
    return res.status(500).json({
      error: 'An error occurred during Fuzzy calculation',
      message: error.message
    });
  }
});

// 3. /api/pdc/status: Logs system performance and multi-core process handling
app.get('/api/pdc/status', (req, res) => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  
  // Calculate average CPU utilization across all cores
  let totalIdle = 0;
  let totalTick = 0;
  
  cpus.forEach((core) => {
    for (const type in core.times) {
      totalTick += core.times[type];
    }
    totalIdle += core.times.idle;
  });
  
  const cpuIdleAvg = totalIdle / cpus.length;
  const cpuTickAvg = totalTick / cpus.length;
  const cpuUtilization = 100 - Math.round((cpuIdleAvg / cpuTickAvg) * 100);
  
  return res.json({
    coresCount: cpus.length,
    cpuModel: cpus[0].model,
    cpuUtilization: Math.max(5, Math.min(cpuUtilization, 98)), // Normalized between 5% and 98% for realistic display
    freeMemoryGB: (freeMem / (1024 * 1024 * 1024)).toFixed(2),
    totalMemoryGB: (totalMem / (1024 * 1024 * 1024)).toFixed(2),
    memoryUtilization: Math.round(((totalMem - freeMem) / totalMem) * 100),
    activeParallelProcesses: activeProcessCount,
    osPlatform: os.platform(),
    osRelease: os.release(),
    uptimeSeconds: os.uptime(),
    dbConnected: isMongoConnected
  });
});

// 4. GET /api/transactions: Fetches transaction history for tables and charts
app.get('/api/transactions', async (req, res) => {
  try {
    if (isMongoConnected) {
      const dbLogs = await Transaction.find().sort({ timestamp: -1 }).limit(100);
      return res.json(dbLogs);
    } else {
      return res.json(localTransactions);
    }
  } catch (error) {
    console.error('Fetch transactions error:', error);
    return res.status(500).json({ error: 'Failed to fetch transaction logs' });
  }
});

// 5. DELETE /api/transactions/clear: Clears transaction history
app.post('/api/transactions/clear', async (req, res) => {
  try {
    if (isMongoConnected) {
      await Transaction.deleteMany({});
    } else {
      localTransactions = [];
    }
    return res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to clear logs' });
  }
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`Smart City Traffic & Emergency Management API`);
  console.log(`Running on: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
