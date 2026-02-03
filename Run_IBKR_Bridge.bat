@echo off
TITLE IBKR TWS Bridge (Keep Open)
COLOR 0A
ECHO ========================================================
ECHO    IBKR TWS Bridge Server - Auto Starter
ECHO ========================================================
ECHO.
ECHO [1/2] Navigating to bridge directory...
cd /d "%~dp0tws-bridge"

ECHO [2/2] Starting server...
ECHO.
ECHO  Status: Connecting to TWS...
ECHO  (If this fails, make sure TWS is open!)
ECHO.
npm start

PAUSE
