const express = require('express');
const axios = require('axios');
const router = express.Router();
const authController = require('../controllers/authController');
const tradeController = require('../controllers/tradeController');
const { auth } = require('../middleware/auth'); // ✅ Ensure correct import

const MARKET_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];

// Auth routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/verify', authController.verifyToken);

// Trading routes (protected)
router.use('/trades', auth);
router.use('/trading', auth);
router.use('/pairs', auth);
router.use('/stats', auth);

// Trade routes
router.get('/trades', tradeController.getTrades);
router.post('/trades', tradeController.createTrade);
router.get('/trades/:id', tradeController.getTradeById);

// Trading control routes
router.post('/trading/auto', tradeController.toggleAutoTrading);
router.post('/trading/manual', tradeController.executeManualTrade);

// Trading pairs
router.get('/pairs', tradeController.getTradingPairs);

// Stats routes
router.get('/stats', tradeController.getStats);

// ✅ Fallback API for market data
router.get('/market/fallback', async (req, res) => {
    try {
        let marketData = [];
        for (const symbol of MARKET_SYMBOLS) {
            const response = await axios.get(`https://api.bitget.com/api/v2/market/ticker?symbol=${symbol}`);
            if (response.data && response.data.data) {
                marketData.push(response.data.data);
            } else {
                console.warn(`⚠️ No data for ${symbol}`);
            }
        }
        res.json({ success: true, data: marketData });
    } catch (error) {
        console.error(`❌ Error fetching fallback market data: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to fetch fallback market data', error: error.message });
    }
});

module.exports = router;
