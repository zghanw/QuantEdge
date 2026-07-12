# QuantEdge Analyst

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-109989?style=for-the-badge&logo=FASTAPI&logoColor=white)
![Pandas](https://img.shields.io/badge/Pandas-2C2D72?style=for-the-badge&logo=pandas&logoColor=white)
![Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=google&logoColor=white)
![WebSockets](https://img.shields.io/badge/WebSockets-000000?style=for-the-badge&logo=socket.io&logoColor=white)

A high-performance, real-time stock market dashboard designed to track US Stocks and ETFs, calculate quantitative algorithmic indicators, and generate AI market insights on the fly.

> **Note on Usage**: This project is designed as an open-source, self-hosted tool for personal use. By utilizing a "Bring Your Own Key" (BYOK) architecture, it elegantly bypasses commercial scaling bottlenecks and API rate limits, allowing anyone to run their own private quantitative engine for free.

![How it looks like](assets\visual.png)

---

## 📖 Table of Contents
1. [Executive Summary](#-executive-summary)
2. [Market Analysis & Business Model](#-market-analysis--business-model)
3. [Feasibility Study & PIECES Framework](#-feasibility-study--pieces-framework)
4. [System Architecture](#-system-architecture)
5. [User Flow](#-user-flow)
6. [Software Development Life Cycle (SDLC)](#-software-development-life-cycle-sdlc)
7. [Tech Stack](#-tech-stack)
8. [Setup & Installation](#-setup--installation)
9. [How to Close](#-how-to-close)
10. [For Learners: How I Built This Project](#-for-learners-how-i-built-this-project)
11. [License](#-license)
12. [Thank You](#-thank-you)

---

## 🎯 Executive Summary

### The Problem
Retail investors often lack access to institutional-grade, real-time quantitative analysis. Existing platforms are either prohibitively expensive (e.g., Bloomberg Terminals) or provide delayed, static data without actionable insights. Furthermore, understanding complex technical indicators (RSI, MACD, Moving Averages) requires a steep learning curve that alienates casual traders.

### The Aim
To democratize high-frequency algorithmic market intelligence by building a lightweight, highly responsive web application that translates raw tick data into plain-English financial insights in real-time.

### The Solution
**QuantEdge Analyst** combines a real-time WebSocket data pipeline (Polygon.io) with a backend Quantitative Engine (Pandas). Instead of forcing users to manually interpret charts, the system feeds live mathematical data to an integrated Generative AI (Google Gemini 2.5 Flash), which produces instant, human-readable market interpretations exactly when needed.

---

## 🆕 V2: Regime & Context Upgrade

Informed by a study of [worldmonitor](https://github.com/koala73/worldmonitor)'s finance stack, V2 upgrades accuracy, context, and reliability — all on free, keyless data sources:

- **Market Regime banner**: a composite Risk-On / Neutral / Risk-Off verdict from five independent signals — SPY vs its 200-day average (Polygon), watchlist breadth, VIX (Yahoo Finance), the 10Y-2Y yield spread (FRED), and CNN Fear & Greed. Per-ticker signals that fight the regime get a ⚠ counter-regime warning.
- **True daily golden cross**: SMA 50/200 is now computed on daily bars (RSI/MACD stay on 5-minute bars for intraday momentum), and live ticks build proper 5-minute candles instead of mutating history.
- **AI analyst v2**: the Gemini note follows a strict Read / Context / Confirmation / Invalidation / Horizon structure, grounded in live per-ticker headlines (Yahoo Finance RSS) and the current market regime.
- **Honest signals**: every payload carries a confidence level, bar counts, data age, and a delayed-feed flag. `uv run python backtest.py SPY QQQ` replays the exact live scoring rule over historical daily bars so you can see its real hit rate before trusting it.
- **Reliability**: the Polygon feed auto-reconnects with backoff and falls back to REST polling on plans without websocket access; `GET /health` reports per-source freshness; the watchlist persists across refreshes (localStorage + shareable `?tickers=` URL).

> **Disclaimer**: QuantEdge is a research and decision-support tool, not a trading signal system. Signals and AI notes are educational context — no output guarantees profitable trades.

---

## 📊 Market Analysis & Business Model

### Market Analysis
The retail trading demographic has surged in recent years, leading to an increasing demand for "Robo-Advisors" and AI-driven stock screeners. Direct competitors (such as TradingView or Yahoo Finance) offer technical indicators but lock real-time millisecond data and AI-driven summaries behind expensive premium monthly subscriptions.

### Business Model
This project operates on an **Open-Source / Bring Your Own Key (BYOK)** model. 
- **Cost Efficiency**: By requiring users to supply their own free-tier API keys, the central server bears zero data acquisition costs.
- **Infinite Scalability**: This completely circumvents enterprise rate-limiting bottlenecks. Every new user scales horizontally on their own free-tier quota, making the software infinitely sustainable.

---

## 🔍 Feasibility Study & PIECES Framework

### Feasibility Study
- **Technical Feasibility**: Highly feasible. Utilizes a lightweight Python backend (FastAPI) and a modern React frontend. We deliberately discarded heavy relational databases (PostgreSQL) to maintain a purely stateless, in-memory, high-speed stream.
- **Economic Feasibility**: Zero server cost for data. The BYOK model pushes the data acquisition limits to the end-user.
- **Operational Feasibility**: Extremely simple to deploy and operate locally with only two terminal commands. No complex Docker containers or database migrations are required.

### PIECES Framework Analysis
- **Performance**: Millisecond latency achieved via multiplexed WebSockets instead of REST API polling.
- **Information**: Complex mathematical data (RSI, MACD) is instantly synthesized into highly readable plain-text AI insights.
- **Economics**: 100% free for users utilizing the Polygon and Gemini free tiers.
- **Control**: Users retain total control and privacy over their data streams and API keys locally.
- **Efficiency**: The SPA (Single Page Application) architecture ensures absolutely no full page reloads, efficiently processing thousands of ticks dynamically.
- **Service**: High availability and seamless user experience, assuming third-party APIs (Polygon/Gemini) remain online.

---

## 🏗️ System Architecture

Our architecture is strictly separated into a stateless high-performance backend and a reactive frontend:

1. **Real-Time Pipeline**: A multiplexed WebSocket connection manager built with FastAPI streams live tick data directly from Polygon.io to the React frontend, bypassing free-tier REST API rate limits.
2. **Quantitative Engine**: As live data ticks in, Pandas and technical analysis (`ta`) libraries continuously recalculate Moving Average Crossovers (50/200 on daily bars), MACD momentum, and RSI oscillators (on 5-minute bars) to generate dynamic Buy/Sell/Hold signals, cross-checked against a five-signal Market Regime composite.
3. **Generative AI Loop**: An asynchronous background thread runs independently on the backend. When a user clicks "Refresh", it pings the Google Gemini API with the latest indicator math to generate and broadcast human-readable algorithmic interpretations over the two-way WebSocket connection.

---

## 🔄 User Flow

1. **Initialization**: The user opens the dashboard. The React SPA immediately boots up and establishes a persistent WebSocket connection to the FastAPI backend.
2. **Search Query**: The user inputs a US Stock or ETF ticker (e.g., `AAPL` or `SPY`).
3. **Historical Fetch**: The backend fetches 15 days of historical data via a REST API and calculates initial indicators. It instantly packages this historical array and pushes it to the frontend to draw the initial Recharts line graph.
4. **Live Streaming**: The backend subscribes to the Polygon live tick stream for that ticker. As new prices arrive, they are broadcast continuously to the frontend, updating the graph and metrics seamlessly.
5. **AI Interpretation**: The user clicks the "Refresh" button in the AI column. The backend instantly passes the current live metrics to Gemini 2.5 Flash and returns an actionable summary to the UI.

---

## 🔄 Software Development Life Cycle (SDLC)

This project followed an **Agile / Iterative** SDLC methodology:
- **Phase 1 (Prototyping)**: Initial setup of the React frontend and designing the UI mockups for a market dashboard.
- **Phase 2 (Architectural Design)**: Designed a completely serverless/stateless, high-speed, BYOK architecture to eliminate database dependencies and setup friction.
- **Phase 3 (Core Integration)**: Connected the Polygon.io WebSocket and successfully streamed high-frequency data to the React frontend.
- **Phase 4 (AI Expansion)**: Integrated the cutting-edge Google Gemini 2.5 Flash model to introduce the "AI Analyst" feature.
- **Phase 5 (UI/UX Polish)**: Completely redesigned the UI into a highly responsive 3-column horizontal layout using custom CSS Glassmorphism and a retro pixel font aesthetic.

---

## 🚀 Tech Stack

- **Backend**: Python, FastAPI, Uvicorn, Pandas, `ta` (Technical Analysis library)
- **AI Integration**: Google GenAI SDK (`gemini-2.5-flash`)
- **Frontend**: React, Vite, Recharts, Vanilla CSS (Glassmorphism)
- **Data Source**: Polygon.io (WebSocket Tick Data & REST Aggregates)

---

## 🛠️ Setup & Installation

This project utilizes a "Bring Your Own Key" architecture. Anyone can clone this repository and run it locally, but each user must supply their own API keys to prevent hitting strict rate limits (such as Polygon's 5 historical fetches per minute).

### Prerequisites
- **uv**: Modern, extremely fast Python package manager.
- **Node.js & npm**: For the React frontend.
- **API Keys**: Place your free Polygon.io and Google Gemini keys in a `.env` file inside the `backend/` directory:
  ```env
  POLYGON_API_KEY=your_polygon_key
  GEMINI_API_KEY=your_gemini_key
  ```

### 1. Install & Start the Backend (FastAPI)
```bash
cd backend
# Install Python dependencies using uv
uv sync
# Start the server
uv run uvicorn main:app --port 8000 --reload
```

### 2. Install & Start the Frontend (React + Vite)
```bash
cd frontend
# Install Node dependencies using npm
npm install
# Start the development server
npm run dev
```

Navigate to **http://localhost:3000** (or whatever port Vite assigns) to view the live dashboard!

---

## 🛑 How to Close
To cleanly shut down the project and free up system resources:
1. Go to the frontend terminal and press `Ctrl + C`.
2. Go to the backend terminal and press `Ctrl + C`.

---

## 📚 For Learners: How I Built This Project

If you are a student or a beginner developer looking to understand how this was built, this section is for you! Here is the step-by-step roadmap of my vision and how I executed it.

### The Roadmap & Step-by-Step Guide

#### Step 1: Frontend Foundation (React + Vite)
- **Goal**: Create a blazing fast user interface.
- **Action**: I bootstrapped the project using **Vite** (a modern frontend build tool that is much faster than Create-React-App). I designed a custom **Glassmorphism** CSS aesthetic to make the financial data look sleek and premium.
- **Key Term**: *SPA (Single Page Application)* - A web app that loads a single web document and dynamically updates the content via JavaScript, preventing annoying page reloads.

#### Step 2: Backend Core (FastAPI)
- **Goal**: Build a high-performance Python server to handle heavy math and API requests.
- **Action**: I chose **FastAPI** because it natively supports asynchronous programming (`async/await`), which is absolutely crucial when dealing with real-time continuous data streams.
- **Key Term**: *Stateless Architecture* - A server design where the server does not store any persistent data (like user logins or databases). It simply processes incoming live data and pushes it directly to the user, making it incredibly lightweight and fast. Also widely known as serverless if you study cloud before.

#### Step 3: Real-Time Data Pipeline (WebSockets + Polygon.io)
- **Goal**: Stream live stock prices to the UI without hitting API rate limits.
- **Action**: I connected the backend to Polygon.io's live tick stream. Instead of having every user's browser connect to Polygon directly (which would break the free tier's 1-connection limit), I designed the backend to act as a central **Multiplexer**.
- **Key Term**: *WebSocket* - A continuous, two-way connection between a client and a server (unlike REST APIs, where the client has to constantly "ask" the server for new data).
- **Key Term**: *Multiplexing* - Taking a single data stream (the Polygon feed) and seamlessly broadcasting it to multiple destinations (the React clients) simultaneously.

#### Step 4: Quantitative Math Engine (Pandas)
- **Goal**: Turn raw tick prices into actionable trading signals.
- **Action**: I used **Pandas** (a Python data analysis library) and the `ta` library to continuously recalculate Moving Averages (SMA 50/200), MACD momentum, and RSI oscillators on the fly the moment new prices arrive.
- **Key Term**: *Technical Indicators* - Mathematical pattern calculations based on historic price/volume data used by traders to predict future price movements.

#### Step 5: Generative AI Integration (Google Gemini)
- **Goal**: Translate the complex math into human-readable insights.
- **Action**: I integrated the Google Gemini 2.5 Flash API. When a user clicks "Refresh", the backend takes all the current Pandas calculations, wraps them in a strict prompt, and asks the AI to act as a quantitative analyst to explain what the math actually means.
- **Key Term**: *LLM (Large Language Model)* - An AI system trained on massive amounts of text to understand and generate human language.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Thank You

Thank you so much for taking the time to read through my documentation and explore my project! I built this to demonstrate my passion for software engineering, real-time data architectures, and financial technology. If you have any feedback or want to connect, please feel free to reach out!
