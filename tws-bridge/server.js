/**
 * TWS Bridge Server
 * Connects to Interactive Brokers TWS and exposes REST API for web app
 */

const express = require('express');
const cors = require('cors');
const { IBApi, EventName, SecType } = require('@stoqey/ib');

const app = express();
const PORT = 3001;
const TWS_PORT = 7496; // Live account
const CLIENT_ID = 1;

// Enable CORS for web app
app.use(cors());
app.use(express.json());

// Connection state
let ib = null;
let isConnected = false;
let accountData = {};
let positions = [];
let executions = [];
let accountIds = new Set();
let lastError = null;
let priceReqId = 10000;
const pendingPriceRequests = new Map(); // reqId -> { resolve, symbol }

// Initialize IB connection
function connectToTWS() {
    console.log(`[TWS Bridge] Connecting to TWS on port ${TWS_PORT}...`);

    ib = new IBApi({
        host: '127.0.0.1',
        port: TWS_PORT,
        clientId: CLIENT_ID
    });

    // Connection events
    ib.on(EventName.connected, () => {
        console.log('[TWS Bridge] ✅ Connected to TWS!');
        isConnected = true;
        lastError = null;

        // Request positions first to get account IDs
        ib.reqPositions();

        // Also request managed accounts
        ib.reqManagedAccts();

        // Request executions (Trade History)
        console.log('[TWS Bridge] Requesting executions...');
        ib.reqExecutions({}); // Empty filter = all executions

        // Request Delayed Data (Type 3) if live not available
        console.log('[TWS Bridge] Setting Market Data Type to Delayed...');
        ib.reqMarketDataType(3);
    });

    ib.on(EventName.disconnected, () => {
        console.log('[TWS Bridge] ❌ Disconnected from TWS');
        isConnected = false;
    });

    ib.on(EventName.error, (err, code, reqId) => {
        // Ignore certain non-critical errors
        if (code === 321 || code === 2104 || code === 2106 || code === 2158) return;
        console.error(`[TWS Bridge] Error: ${err.message} (code: ${code})`);
        lastError = { message: err.message, code, reqId };
    });

    // Managed accounts callback
    ib.on(EventName.managedAccounts, (accountsList) => {
        const accounts = accountsList.split(',').filter(a => a.trim());
        console.log('[TWS Bridge] Managed accounts:', accounts);
        accounts.forEach(acc => accountIds.add(acc.trim()));

        // Request account updates for each account
        accounts.forEach(acc => {
            console.log(`[TWS Bridge] Requesting account data for ${acc}`);
            ib.reqAccountUpdates(true, acc.trim());
        });
    });

    // Account data updates
    ib.on(EventName.updateAccountValue, (key, value, currency, accountName) => {
        if (!accountName) return;
        if (!accountData[accountName]) {
            accountData[accountName] = {};
        }
        accountData[accountName][key] = { value, currency };
    });

    ib.on(EventName.accountDownloadEnd, (accountName) => {
        console.log(`[TWS Bridge] Account data loaded for ${accountName}`);
    });

    // Position updates
    ib.on(EventName.position, (account, contract, pos, avgCost) => {
        // Track account ID
        if (account) accountIds.add(account);

        const key = `${account}_${contract.symbol}`;
        const existing = positions.findIndex(p => `${p.account}_${p.symbol}` === key);
        const posData = {
            account,
            symbol: contract.symbol,
            secType: contract.secType,
            exchange: contract.exchange,
            currency: contract.currency,
            position: pos,
            avgCost
        };

        if (existing >= 0) {
            if (pos === 0) {
                positions.splice(existing, 1);
            } else {
                positions[existing] = posData;
            }
        } else if (pos !== 0) {
            positions.push(posData);
        }
    });

    ib.on(EventName.positionEnd, () => {
        positions = positions.filter(p => p.position !== 0);
        console.log(`[TWS Bridge] Positions updated: ${positions.length} open positions`);
    });

    // Execution details (Trade History)
    ib.on(EventName.execDetails, (reqId, contract, execution) => {
        // Avoid duplicates
        const exists = executions.some(e => e.execId === execution.execId);
        if (!exists) {
            executions.push({
                execId: execution.execId,
                time: execution.time,
                acctNumber: execution.acctNumber,
                exchange: execution.exchange,
                side: execution.side,
                shares: execution.shares,
                price: execution.price,
                permId: execution.permId,
                liquidation: execution.liquidation,
                cumQty: execution.cumQty,
                avgPrice: execution.avgPrice,
                orderRef: execution.orderRef,
                evRule: execution.evRule,
                evMultiplier: execution.evMultiplier,
                modelCode: execution.modelCode,
                lastLiquidity: execution.lastLiquidity,
                symbol: contract.symbol,
                secType: contract.secType,
                currency: contract.currency
            });
        }
    });

    ib.on(EventName.execDetailsEnd, (reqId) => {
        console.log(`[TWS Bridge] Executions updated: ${executions.length} trades found`);
    });

    // Market Data (Tick Price)
    ib.on(EventName.tickPrice, (reqId, field, price) => {
        // field: 4 = Last, 9 = Close, 68 = Delayed Last, 75 = Delayed Close
        if ([4, 9, 68, 75].includes(field) && price > 0) {
            const req = pendingPriceRequests.get(reqId);
            if (req) {
                req.resolve(price);
                pendingPriceRequests.delete(reqId); // Done
                ib.cancelMktData(reqId);
            }
        }
    });

    // Connect
    ib.connect();
}

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        connected: isConnected,
        twsPort: TWS_PORT,
        accounts: Array.from(accountIds),
        positionCount: positions.length,
        lastError,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/account', (req, res) => {
    if (!isConnected) {
        return res.status(503).json({ error: 'Not connected to TWS' });
    }

    const accounts = Object.keys(accountData);
    if (accounts.length === 0) {
        return res.json({
            message: 'Account data loading...',
            knownAccounts: Array.from(accountIds),
            hint: 'Try again in a few seconds'
        });
    }

    const summary = {};
    let totalNetLiq = 0;
    let totalCash = 0;
    let totalUnrealizedPnL = 0;

    for (const accountId of accounts) {
        const data = accountData[accountId];
        const netLiq = parseFloat(data.NetLiquidation?.value) || 0;
        const cash = parseFloat(data.TotalCashValue?.value) || 0;
        const unrealizedPnL = parseFloat(data.UnrealizedPnL?.value) || 0;

        totalNetLiq += netLiq;
        totalCash += cash;
        totalUnrealizedPnL += unrealizedPnL;

        summary[accountId] = {
            netLiquidation: netLiq,
            totalCashValue: cash,
            availableFunds: parseFloat(data.AvailableFunds?.value) || 0,
            buyingPower: parseFloat(data.BuyingPower?.value) || 0,
            grossPositionValue: parseFloat(data.GrossPositionValue?.value) || 0,
            unrealizedPnL: unrealizedPnL,
            realizedPnL: parseFloat(data.RealizedPnL?.value) || 0,
            currency: data.NetLiquidation?.currency || 'USD'
        };
    }

    // Add totals across all accounts
    summary._totals = {
        netLiquidation: totalNetLiq,
        totalCashValue: totalCash,
        unrealizedPnL: totalUnrealizedPnL,
        accountCount: accounts.length
    };

    res.json(summary);
});

app.get('/api/positions', (req, res) => {
    if (!isConnected) {
        return res.status(503).json({ error: 'Not connected to TWS' });
    }

    // Optional filter by account
    const { account } = req.query;
    if (account) {
        return res.json(positions.filter(p => p.account === account));
    }

    res.json(positions);
});

app.get('/api/executions', (req, res) => {
    if (!isConnected) {
        return res.status(503).json({ error: 'Not connected to TWS' });
    }

    // Optional filter by account
    const { account } = req.query;
    if (account) {
        return res.json(executions.filter(e => e.acctNumber === account));
    }

    res.json(executions);
});

// Fetch Market Data Snapshot for multiple symbols
app.post('/api/market-data', async (req, res) => {
    if (!isConnected) {
        return res.status(503).json({ error: 'Not connected to TWS' });
    }

    const { symbols } = req.body; // Expecting array of strings
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: 'Invalid symbols array' });
    }

    const results = {};
    const promises = symbols.map(symbol => {
        return new Promise((resolve) => {
            const reqId = priceReqId++;

            // Timeout after 2 seconds
            const timeout = setTimeout(() => {
                if (pendingPriceRequests.has(reqId)) {
                    pendingPriceRequests.delete(reqId);
                    ib.cancelMktData(reqId);
                    resolve(null); // Failed
                }
            }, 2000);

            pendingPriceRequests.set(reqId, {
                resolve: (price) => {
                    clearTimeout(timeout);
                    results[symbol] = price;
                    resolve(price);
                },
                symbol
            });

            // Request Snapshot
            ib.reqMktData(reqId, {
                symbol: symbol,
                secType: 'STK',
                exchange: 'SMART',
                currency: 'USD'
            }, "", true, false);
        });
    });

    await Promise.all(promises);
    res.json(results);
});

// Request fresh account update
app.post('/api/refresh', (req, res) => {
    if (!isConnected || !ib) {
        return res.status(503).json({ error: 'Not connected to TWS' });
    }

    // Re-request positions and account updates
    ib.reqManagedAccts();
    ib.reqPositions();

    res.json({ message: 'Refresh requested' });
});

app.post('/api/connect', (req, res) => {
    if (isConnected) {
        return res.json({ message: 'Already connected' });
    }

    try {
        connectToTWS();
        res.json({ message: 'Connection initiated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/disconnect', (req, res) => {
    if (ib) {
        ib.disconnect();
    }
    isConnected = false;
    accountData = {};
    positions = [];
    accountIds = new Set();
    res.json({ message: 'Disconnected' });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`   TWS Bridge Server`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`========================================`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /api/status     - Connection status`);
    console.log(`  GET  /api/account    - Account summary (all accounts)`);
    console.log(`  GET  /api/positions  - Open positions (?account=X to filter)`);
    console.log(`  POST /api/refresh    - Refresh data from TWS`);
    console.log(`  POST /api/connect    - Connect to TWS`);
    console.log(`  POST /api/disconnect - Disconnect from TWS`);
    console.log(`\nMake sure TWS is running with API enabled on port ${TWS_PORT}`);
    console.log(`\n`);

    // Auto-connect on startup
    connectToTWS();
});
