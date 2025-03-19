const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Please provide a username'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [20, 'Username cannot exceed 20 characters']
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false
  },
  apiKey: {
    type: String,
    default: '',
    select: false
  },
  apiSecret: {
    type: String,
    default: '',
    select: false
  },
  autoTrading: {
    type: Boolean,
    default: false
  },
  tradingPairs: [{
    type: String,
    default: []
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  
  // Encrypt API credentials if provided
  if (this.apiKey && this.apiKey.length > 0) {
    const keySalt = await bcrypt.genSalt(10);
    this.apiKey = await bcrypt.hash(this.apiKey, keySalt);
  }
  
  if (this.apiSecret && this.apiSecret.length > 0) {
    const secretSalt = await bcrypt.genSalt(10);
    this.apiSecret = await bcrypt.hash(this.apiSecret, secretSalt);
  }
  
  next();
});

// Sign JWT token
UserSchema.methods.getSignedToken = function() {
  return jwt.sign(
    { id: this._id }, 
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// Match password
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);