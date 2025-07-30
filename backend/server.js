// server.js - Complete AudioCraft Backend
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// File upload setup
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// In-memory database (replace with MongoDB in production)
const users = new Map();
const sessions = new Map();

// Helper: Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'secret-key', { expiresIn: '7d' });
};

// === AUTH ROUTES ===

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (users.has(email)) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    
    const user = {
      id: userId,
      email,
      password: hashedPassword,
      freeTracksLeft: 3,
      subscription: { status: 'none' },
      createdAt: new Date()
    };
    
    users.set(email, user);
    const token = generateToken(userId);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        freeTracksLeft: user.freeTracksLeft,
        subscription: user.subscription
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.get(email);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const token = generateToken(user.id);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        freeTracksLeft: user.freeTracksLeft,
        subscription: user.subscription
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify token
app.get('/api/auth/verify', (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
    const user = Array.from(users.values()).find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        freeTracksLeft: user.freeTracksLeft,
        subscription: user.subscription
      }
    });
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// === AUDIO ROUTES ===

// Process audio
app.post('/api/audio/enhance', upload.single('audio'), async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
    const user = Array.from(users.values()).find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user can process
    if (user.subscription.status !== 'active' && user.freeTracksLeft <= 0) {
      return res.status(403).json({ message: 'No credits remaining' });
    }
    
    // Deduct credit
    if (user.subscription.status !== 'active') {
      user.freeTracksLeft -= 1;
    }
    
    // Simulate audio processing
    const settings = JSON.parse(req.body.settings || '{}');
    const processedFileId = uuidv4();
    
    // In production, you'd actually process the audio here
    // For now, we'll just return success after a delay
    setTimeout(() => {
      console.log('Audio processed with settings:', settings);
    }, 1000);
    
    res.json({
      success: true,
      fileId: processedFileId,
      message: 'Audio enhancement complete',
      creditsRemaining: user.freeTracksLeft
    });
    
    // Clean up uploaded file
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ message: 'Processing failed' });
  }
});

// === PAYMENT ROUTES ===

// Create subscription
app.post('/api/payments/create-checkout', async (req, res) => {
  try {
    const { plan } = req.body;
    
    // In production, create Stripe checkout session here
    // For now, return mock data
    res.json({
      success: true,
      checkoutUrl: `https://checkout.stripe.com/pay/mock_${plan}_session`,
      sessionId: `cs_mock_${uuidv4()}`
    });
  } catch (error) {
    res.status(500).json({ message: 'Payment setup failed' });
  }
});

// Webhook for Stripe
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  // Handle Stripe webhooks in production
  console.log('Webhook received');
  res.json({ received: true });
});

// === USER ROUTES ===

// Get user profile
app.get('/api/users/profile', (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key');
    const user = Array.from(users.values()).find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      id: user.id,
      email: user.email,
      freeTracksLeft: user.freeTracksLeft,
      subscription: user.subscription,
      createdAt: user.createdAt
    });
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// === HEALTH CHECK ===
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 AudioCraft server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Create uploads directory if it doesn't exist
  require('fs').mkdirSync('uploads', { recursive: true });
});