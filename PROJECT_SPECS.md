# PROJECT SPECIFICATION: MK Hedge Fund Dashboard (Web App)

## 1. BUSINESS OBJECTIVE
**Goal:** Build a daily management dashboard for a solo Quant Hedge Fund operator.
**Financial Target:** $5,000/month Net Income combined from two platforms.
**Role:** The user is an "Operator", not a "Day Trader". The app must enforce discipline, routine, and marketing consistency.

## 2. REVENUE STREAMS (The "Products")
### A. Collective2 (C2) - "Quant Momentum Alpha"
- **Type:** Automated B2B Signal Service.
- **Strategy:** Nasdaq-100 & Russell 1000 Momentum Rotation.
- **Pricing:** $125/month.
- **Key Metric:** "TOS" (Trades Own Strategy) badge via IBKR connection.
- **Automation:** Fully automated via IBKR "Broker Transmit".
- **Goal:** ~40-80 subscribers.

### B. eToro - "Barbell Portfolio"
- **Type:** Copy Trading (Social).
- **Strategy:** 50% "Modern Breakout" (Aggressive Growth) + 50% "US All Weather" (Defensive Hedge).
- **Execution:** Manual entry (Low Frequency, ~7 trades/year for Breakout).
- **Target Audience:** Retail investors seeking high returns (>20% CAGR) with controlled drawdowns (~-15%).
- **Key Requirement:** Regular social engagement ("Feed Posts") to please the eToro algorithm.

## 3. CORE APP FEATURES (Functional Requirements)

### Feature 1: The "Empire Dashboard" (KPI + FIRE Vault)
**Purpose:** A single-view "Head-Up Display" to track Business Growth (Income) and Personal Freedom (Net Worth).

**PART A: BUSINESS KPI TRACKER (The Engine)**
**Goal:** Track the growth of the Hedge Fund revenue streams.
- **Data Points (Monthly Entry):**
  - `Month` (e.g., "2026-02")
  - `C2 Subscribers` (Target: 40)
  - `eToro Copiers` (Social Proof)
  - `Assets Under Copy (AUC)` (eToro Tier metric)
  - `Net Income ($)` (Total Revenue - Expenses)
- **Visuals:**
  - **"Income Trend" Chart:** A simple line chart showing Net Income over the last 12 months.
  - **"Subscriber Count" Card:** Big number display vs Goal (e.g., "12 / 40").

**PART B: THE "FIRE 2035" VAULT (The Goal)**
**Goal:** Track capital injections towards the 2035 retirement target.
- **Inputs (The Monthly Deposit Ritual):**
  - `Operator Contribution (EUR)`: (Default: €500)
  - `Operator Contribution (USD)`: (Default: $700)
  - `Wife Contribution (EUR)`: (Default: €250)
  - `EUR/USD Rate`: (Manual input or default 1.05)
- **Logic:**
  - `Total Monthly Added ($)` = `(Op_EUR + Wife_EUR) * Rate + Op_USD`.
  - `Vault Total` = Previous Total + Total Monthly Added + Investment Returns (Optional manual adjustment).
- **Visuals:**
  - **The "Freedom Bar":** A progress bar from **Start Date (2026)** to **End Date (2035)**.
  - **The "Capital Bar":** A progress bar from **$0** to **$X Target** (e.g., $1,000,000).
  - **"Runway" Metric:** "9 Years remaining".

**UI/UX:**
- **Style:** "Dark Mode Financial Terminal". Minimalist.
- **Grid Layout:** Left side = Business KPIs. Right side = Personal Vault.
- **Action:** A prominent "LOG MONTHLY DATA" button to input the numbers.

### Feature 2: Rebalancing Calculator
A tool to manage the manual 50/50 split on eToro.
- **Input:** Current Value of "Breakout Assets" (Stocks) vs "All Weather Assets" (Bonds/Gold).
- **Logic:** If deviation > 5%, calculate exact $ amount to Sell/Buy to restore 50/50 split.
- **Math:** `(Total_Value / 2) - Current_Asset_Value = Action_Amount`.

### Feature 3: KPI Tracker
A simple database/table to track monthly progress towards the $5k goal:
- Columns: Date | C2 Subscribers | eToro Copiers | Assets Under Copy (AUC) | Net Income.
- Visual: Progress bar towards $5,000 target.

### Feature 4: Dynamic Momentum Execution Engine
**Purpose:** Handle monthly signal changes where asset allocations change (e.g., selling Gold entirely to buy Bonds).
**Core Concept:** "Current State" vs "Target State". The app calculates the bridge between them.

**1. ASSET UNIVERSE (The Menu)**
The app supports these 6 assets, but their weights are variable (0% to 50%):
- `CNDX.L` (Nasdaq)
- `SWDA.L` (World)
- `IGLN.L` (Gold)
- `DTLA.L` (Treasuries)
- `ETL2.DE` (Commodities)
- `BTC` (Bitcoin)

**2. INPUT PHASE (The Monthly Ritual)**
The Calculator must have two distinct input sections:

**SECTION A: "Where are we now?" (Current Portfolio)**
- `Cash Available`: [User Input]
- For each Asset:
  - `Units Held`: [User Input] (Auto-fetched from local storage if possible)
  - `Current Price`: [User Input]

**SECTION B: "What are the new signals?" (Target Allocation)**
- User manually enters the **Target %** for each asset based on the monthly signal email.
- *Validation:* The app must warn if the total Sum of Targets != 100% (or allow <100% if going to Cash).
- **Example Scenario:** - User enters `0%` for Gold (Signal: SELL ALL).
  - User enters `20%` for TLT (Signal: BUY).

**3. EXECUTION LOGIC (The Math)**
1. `Total Equity` = (Sum of all (Units * Price)) + Cash.
2. `Target Value ($)` for Asset X = `Total Equity` * `Target % (User Input)`.
3. `Current Value ($)` for Asset X = `Units Held` * `Current Price`.
4. `Net Change ($)` = `Target Value` - `Current Value`.
5. `Trade Size (Units)` = `Net Change` / `Current Price`.

**4. OUTPUT TABLE (The "Traffic Light" Execution)**
This table tells you exactly how to transform your portfolio.

- **Columns:**
  - **Asset**
  - **New Target %** (Display user input)
  - **Action** (Visual Signal):
    - 🔴 **SELL ALL:** If `Target %` is 0 and `Units` > 0.
    - 🔴 **REDUCE:** If `Target %` < `Current Weight`.
    - 🟢 **NEW ENTRY:** If `Target %` > 0 and `Units` == 0.
    - 🟢 **ADD:** If `Target %` > `Current Weight`.
    - ⚪ **HOLD:** If difference is negligible (<5% drift rule applies ONLY if Target % hasn't changed to 0).
  - **Units (+/-):** The exact execution number.
  - **Value ($):** Dollar value of the trade.

**5. "NEW TRADES" SAFETY CHECK**
- If an asset changes from 0% -> X% (New Entry), highlight the row in **BRIGHT GREEN**.
- If an asset changes from X% -> 0% (Full Exit), highlight the row in **BRIGHT RED** and add a warning icon "⚠️ EXIT POSITION".