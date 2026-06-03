import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
  },
  source: {
    type: String,
    enum: ['cv_pipeline', 'manual_calculator'],
    required: true,
  },
  fileName: {
    type: String,
    default: null,
  },
  filePath: {
    type: String,
    default: null,
  },
  processedPath: {
    type: String,
    default: null,
  },
  vehicleCount: {
    cars: { type: Number, default: 0 },
    trucks: { type: Number, default: 0 },
    ambulances: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  trafficDensity: {
    type: Number, // Percentage or score (0-100)
    required: true,
  },
  emergencyStatus: {
    type: String, // 'normal' or 'emergency'
    enum: ['normal', 'emergency'],
    required: true,
  },
  calculatedTimer: {
    type: Number, // Green light duration in seconds
    required: true,
  },
  processingTimeMs: {
    type: Number, // Execution time of Python scripts in ms
    required: true,
  }
});

const Transaction = mongoose.model('Transaction', transactionSchema, 'khalid');


export default Transaction;
