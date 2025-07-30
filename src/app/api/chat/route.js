// src/app/api/chat/route.js

import { NextResponse } from "next/server";
import OpenAI from "openai";
import mongoose from "mongoose";
import CompanyInfo from "@/models/CompanyInfo";
import dotenv from "dotenv";
import yahooFinance from "yahoo-finance2";
import UserChatLog from "@/models/UserChatLog";
import axios from "axios";
import fs from "fs";
import { NSELive, NSEArchive } from "nse-api-package"; // New: Import NSELive and NSEArchive
import { load } from 'cheerio';
const puppeteer = require('puppeteer');
import moment from 'moment';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

// Reuse MongoDB connection in a serverless environment
if (!mongoose.connection.readyState) {
  mongoose
    .connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch((err) => console.error('MongoDB connection error:', err));
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize NSELive instance for realtime market status and additional endpoints
const nseLive = new NSELive();

const functions = [
  {
    name: 'get_stock_price',
    description:
      'Get real-time stock price (current quote), historical price data, and basic information for one or more stock symbols. This function always returns data for Indian stocks only.',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of stock symbols like ["RELIANCE", "TCS"] for Reliance and TCS.',
        },
        underPrice: {
          type: 'number',
          description: 'Optional: filter stocks with current price under this value (in INR).',
        },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'get_crypto_price',
    description:
      'Get real-time cryptocurrency price (current quote), historical price data, and basic information for one or more crypto symbols. Optionally, specify the currency ("USD" or "INR") and a maximum price (underPrice).',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of cryptocurrency symbols like ["BTC", "ETH"] for Bitcoin and Ethereum.',
        },
        currency: {
          type: 'string',
          enum: ['USD', 'INR'],
          description: 'Currency for the price. Default is USD. For INR conversion, use "INR".',
        },
        underPrice: {
          type: 'number',
          description:
            'Optional: filter cryptos with current price under this value (in the specified currency).',
        },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'get_top_stocks',
    description:
      'Get the trending Indian stocks in real time using NSE data. Optionally, specify a price filter (underPrice).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of top stocks to fetch (default is 5).',
        },
        underPrice: {
          type: 'number',
          description: 'Optional: filter stocks with price under this value (in INR).',
        },
      },
    },
  },
  {
    name: 'get_top_cryptos',
    description:
      'Get the trending cryptocurrencies in real time. Optionally, specify the currency ("USD" or "INR") and a price filter (underPrice).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of top cryptos to fetch (default is 5).',
        },
        currency: {
          type: 'string',
          enum: ['USD', 'INR'],
          description: 'Currency for the price. Default is USD. For INR conversion, use "INR".',
        },
        underPrice: {
          type: 'number',
          description: 'Optional: filter cryptos with current price under this value (in the specified currency).',
        },
      },
    },
  },
  {
    name: 'get_company_info',
    description: 'Get information about Profit Flow company and services',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['all', 'features', 'pricing', 'benefits', 'support', 'faq', 'subscription'],
          description: 'Category of information requested',
        },
      },
    },
  },
  {
    name: 'get_market_status',
    description: 'Get realtime Indian market status using NSELive data.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  // New functions from NSELive API:
  {
    name: 'get_trade_info',
    description: 'Get detailed trade information for a specific equity using NSELive.',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of stock symbols for which to fetch trade information.',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_stock_quote_fno',
    description: 'Fetch live F&O data for a specific equity using NSELive.',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of stock symbols for which to fetch F&O data.',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_chart_data',
    description: 'Fetch chart data for a given symbol using NSELive.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock or index symbol for chart data.',
        },
        includeAdditionalData: {
          type: 'boolean',
          description: 'Optional flag to include additional chart details.',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'calculate_stock_roi',
    description:
      'Calculate the ROI (Return on Investment) for a specific stock over a given period (1month, 3month, 6month, or 1year).',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock symbol, e.g. "RELIANCE".',
        },
        period: {
          type: 'string',
          enum: ['1month', '3month', '6month', '1year'],
          description: 'Time period for ROI calculation.',
        },
      },
      required: ['symbol', 'period'],
    },
  },
  {
    name: 'get_highest_return_stock',
    description: 'Scrape the screener website to determine which stock has the highest return over specified period (only supports 1month, 3month, 6month, or 1year). If asked for unsupported periods, returns closest available data with explanation.',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['1month', '3month', '6month', '1year'],
          description: 'Time period for ROI calculation. Only these exact values are supported.',
        },
      },
      required: ['period'],
    },
  },
  // {
  //   name: 'get_market_turnover',
  //   description: 'Fetch market turnover data for a given symbol using NSELive.',
  //   parameters: {
  //     type: 'object',
  //     properties: {
  //       symbol: {
  //         type: 'string',
  //         description: 'Stock symbol for which to fetch market turnover data.',
  //       },
  //     },
  //     required: ['symbol'],
  //   },
  // },
  // {
  //   name: 'get_equity_derivative_turnover',
  //   description: 'Fetch equity derivative turnover data for a given symbol using NSELive.',
  //   parameters: {
  //     type: 'object',
  //     properties: {
  //       symbol: {
  //         type: 'string',
  //         description: 'Stock symbol for which to fetch equity derivative turnover data.',
  //       },
  //     },
  //     required: ['symbol'],
  //   },
  // },
  {
    name: 'get_all_indices',
    description: 'Fetch data of all indices using NSELive.',
    parameters: {
      type: 'object',
      properties: {}
    },
  },
  {
    name: 'get_live_index',
    description: 'Fetch realtime index data for given symbols using pre-loaded indices data',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of index names/symbols to fetch (e.g. ["NIFTY 50", "NIFTY NEXT 50"])',
        },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'get_gainers_and_losers',
    description: 'Fetch top gainers, top losers, or both from NSELive depending on the user query.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'User query specifying what data to fetch (e.g. "top gainers", "top losers", or "gainers and losers").',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_volume_gainers',
    description: 'Fetch volume gainers data using NSELive.',
    parameters: {
      type: 'object',
      properties: {} // No parameters needed
    }
  },

  {
    name: 'should_purchase_stock',
    description:
      'Analyzes a given stock by comparing its current price to the historical average over a specified period, and provides a recommendation on whether to purchase the stock today.',
    parameters: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Stock symbol (e.g. "RELIANCE").',
        },
        period: {
          type: 'string',
          description: 'Time period for historical analysis (e.g. "30days", "15days", "1month"). Defaults to "30days".',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_best_stocks_under_price',
    description: 'Get recommended stocks within a specified price range and/or under a certain market cap based on fundamental analysis criteria from Screener.in.',
    parameters: {
      type: 'object',
      properties: {
        minPrice: {
          type: 'number',
          description: 'Optional minimum price (in INR). If provided, returns stocks priced above this value.',
        },
        maxPrice: {
          type: 'number',
          description: 'Maximum price (in INR). Stocks must be priced below this value.',
        },
        maxMarketCap: {
          type: 'number',
          description: 'Optional maximum market cap in crore INR. If provided, filters stocks by market cap below this value.',
        }
      },
      required: ['maxPrice']
    }
  },
  {
    name: 'get_option_chain_data',
    description: 'Analyze option contracts (PUT/CALL) for NSE indices. Use this for evaluating strike prices, open interest, premiums, and volatility. Returns critical data for options trading decisions including moneyness, OI changes, and IV analysis.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          enum: ['BANKNIFTY', 'NIFTY'],
          description: 'Index name - BANKNIFTY for banking sector, NIFTY for Nifty 50',
        },
        strikePrice: {
          type: 'number',
          description: 'Exact strike price being analyzed (e.g., 49000)',
        },
        optionType: {
          type: 'string',
          enum: ['PE', 'CE'],
          description: 'PE for Put Options, CE for Call Options',
        },
        expiryDate: {
          type: 'string',
          description: 'Optional expiry in DD-MMM-YYYY, MMM, YYYY, MMM-YYYY, MMM YYYY, MMMM, MMMM YYYY format',
        }
      },
      required: ['symbol', 'strikePrice', 'optionType'],
    },
  }
  // {
  //   name: 'get_index_option_chain',
  //   description: 'Fetch the index option chain for a given symbol using NSELive.',
  //   parameters: {
  //     type: 'object',
  //     properties: {
  //       symbol: {
  //         type: 'string',
  //         description: 'Index symbol for which to fetch option chain data.',
  //       },
  //     },
  //     required: [],
  //   },
  // },
];


function calculateSMA(data, windowSize) {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < windowSize - 1) {
      sma.push(null);
    } else {
      const windowSlice = data.slice(i - windowSize + 1, i + 1);
      const sum = windowSlice.reduce((acc, val) => acc + val, 0);
      sma.push(sum / windowSize);
    }
  }
  return sma;
}

/**
 * Helper: Fetch realtime data for a ticker.
 */
async function fetchRealtimeData(ticker) {
  try {
    const quote = await yahooFinance.quote(ticker);
    if (!quote) return null;
    const now = new Date().toISOString();
    return { dates: [now], prices: [quote.regularMarketPrice] };
  } catch (error) {
    console.error(`Error fetching realtime data for ${ticker}:`, error);
    return null;
  }
}

/**
 * Helper: Fetch historical data for a ticker.
 */
async function fetchHistoricalData(ticker, period1, period2, interval = '1d') {
  try {
    const historical = await yahooFinance.historical(ticker, { period1, period2, interval });
    return historical.map(item => ({
      date: item.date,
      price: item.close,
      volume: item.volume, // Add volume data
    }));
  } catch (error) {
    console.error(`Error fetching historical data for ${ticker}:`, error);
    return [];
  }
}

/**
 * Helper: Fetch detailed info for a ticker.
 */
async function fetchDetailedInfo(ticker) {
  try {
    const detailedInfo = await yahooFinance.quoteSummary(ticker, {
      modules: ['summaryDetail', 'summaryProfile', 'assetProfile']
    });
    return detailedInfo;
  } catch (error) {
    console.error(`Error fetching detailed info for ${ticker}:`, error);
    return null;
  }
}

/**
 * Helper: Fetch recent news for a ticker.
 * (Retained for stock and crypto functions as needed)
 */
async function fetchNews(ticker) {
  try {
    const searchResult = await yahooFinance.search(`${ticker} news`, { lang: 'en-IN', region: 'IN' });
    let news = searchResult.news || [];
    if (!news.length) {
      console.warn(`No news found for ${ticker}.`);
    }
    return news;
  } catch (error) {
    console.error(`Error fetching news for ${ticker}:`, error);
    return [];
  }
}

/**
 * Fetch real-time stock data for Indian stocks.
 */
async function getStockPrice(symbols, underPrice) {
  const results = [];
  const now = new Date();
  const past7Days = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

  for (let symbol of symbols) {
    try {
      let querySymbol = symbol;
      if (!symbol.includes('.') && /^[A-Z]+$/.test(symbol)) {
        querySymbol = `${symbol}.NS`;
      }
      const quote = await yahooFinance.quote(querySymbol);
      const rtData = await fetchRealtimeData(querySymbol);
      if (!rtData) {
        results.push({ symbol, error: 'No real-time data available' });
        continue;
      }
      const history = await fetchHistoricalData(querySymbol, past7Days, now, '1d');
      const detailedInfo = await fetchDetailedInfo(querySymbol);
      const news = await fetchNews(querySymbol);

      results.push({
        symbol: querySymbol,
        name: quote.longName || symbol,
        dates: rtData.dates,
        prices: rtData.prices,
        history,
        change: quote.regularMarketChange,
        changePercentage: quote.regularMarketChangePercent,
        marketCap: quote.marketCap,
        detailedInfo,
        news
      });
    } catch (error) {
      console.error(`Error fetching stock price for ${symbol}:`, error);
      results.push({ symbol, error: 'Unable to fetch data' });
    }
  }
  if (underPrice !== undefined) {
    return results.filter((r) => r.prices[0] < underPrice);
  }
  return results;
}

// Fetch trending (top) stocks.
async function getTopStocks(limit = 5, underPrice) {
  let results = [];
  const now = new Date();
  const past7Days = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

  try {
    const cookieResponse = await axios.get('https://www.nseindia.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const cookies = cookieResponse.headers['set-cookie'];
    const cookieHeader = cookies ? cookies.join('; ') : '';

    const nseResponse = await axios.get(
      'https://www.nseindia.com/api/live-analysis-variations?index=gainers',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.nseindia.com/',
          'Cookie': cookieHeader,
        },
      }
    );
    const trendingData = nseResponse.data?.NIFTY?.data;
    if (!trendingData || trendingData.length === 0) {
      throw new Error('No trending data available from NSE API');
    }


    const symbols = trendingData
      .map((item) => item.symbol)
      .slice(0, limit)
      .map((sym) => (sym.includes('.') ? sym : sym + '.NS'));
    for (const symbol of symbols) {
      try {
        const quote = await yahooFinance.quote(symbol);
        const rtData = await fetchRealtimeData(symbol);
        if (!rtData) continue;
        const history = await fetchHistoricalData(symbol, past7Days, now, '1d');
        const detailedInfo = await fetchDetailedInfo(symbol);
        const news = await fetchNews(symbol);
        results.push({
          symbol,
          name: quote.longName || symbol,
          dates: rtData.dates,
          prices: rtData.prices,
          history,
          change: quote.regularMarketChange,
          changePercentage: quote.regularMarketChangePercent,
          marketCap: quote.marketCap,
          detailedInfo,
          news
        });
      } catch (err) {
        console.error(`Error fetching realtime data for ${symbol}:`, err);
      }
    }
  } catch (error) {
    console.error('Error fetching top stocks from NSE:', error);
    return { error: 'Unable to fetch trending Indian stocks from NSE.' };
  }
  if (underPrice !== undefined) {
    results = results.filter((r) => r.prices[0] < underPrice);
  }
  return results;
}

// Fetch real-time crypto data.
async function getCryptoPrice(symbols, currency = 'USD', underPrice) {
  let conversionRate = 1;
  if (currency === 'INR') {
    try {
      const rateQuote = await yahooFinance.quote('USDINR=X');
      conversionRate = rateQuote.regularMarketPrice || 1;
    } catch (error) {
      console.error('Error fetching conversion rate:', error);
    }
  }
  const results = [];
  const now = new Date();
  const past7Days = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
  for (let symbol of symbols) {
    try {
      if (!symbol.includes('-')) {
        symbol = `${symbol}-USD`;
      }
      const quote = await yahooFinance.quote(symbol);
      const rtData = await fetchRealtimeData(symbol);
      if (!rtData) {
        results.push({ symbol, error: 'No real-time data available' });
        continue;
      }
      let price = rtData.prices[0];
      if (currency === 'INR') {
        price = price * conversionRate;
      }
      const history = await fetchHistoricalData(symbol, past7Days, now, '1d');
      let detailedInfo = null;
      let news = [];
      try {
        detailedInfo = await fetchDetailedInfo(symbol);
        news = await fetchNews(symbol);
      } catch (err) {
        console.error(`Error fetching detailed info or news for ${symbol}:`, err);
      }
      results.push({
        symbol,
        name: quote.shortName || symbol,
        dates: rtData.dates,
        prices: [price],
        history,
        change: quote.regularMarketChange,
        changePercentage: quote.regularMarketChangePercent,
        marketCap: quote.marketCap,
        detailedInfo,
        news
      });
    } catch (error) {
      console.error(`Error fetching crypto price for ${symbol}:`, error);
      results.push({ symbol, error: 'Unable to fetch data' });
    }
  }
  if (underPrice !== undefined) {
    const filtered = results.filter((r) => r.prices[0] < underPrice);
    return filtered.length > 0 ? filtered : [{ message: `No cryptocurrencies found with a price under ${underPrice}.` }];
  }
  return results;
}

async function getTopCryptos(limit = 5, currency = 'USD', underPrice) {
  let conversionRate = 1;
  if (currency === 'INR') {
    try {
      const rateQuote = await yahooFinance.quote('USDINR=X');
      conversionRate = rateQuote.regularMarketPrice || 1;
    } catch (error) {
      console.error('Error fetching conversion rate:', error);
    }
  }
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1`
    );
    const coins = await response.json();
    if (!coins || !coins.length) {
      throw new Error('Failed to fetch top cryptocurrencies');
    }
    let results = [];
    const now = new Date();
    const past7Days = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    for (const coin of coins) {
      const symbol = `${coin.symbol.toUpperCase()}-USD`;
      try {
        const quote = await yahooFinance.quote(symbol);
        const rtData = await fetchRealtimeData(symbol);
        if (!rtData) continue;
        let price = rtData.prices[0];
        if (currency === 'INR') {
          price = price * conversionRate;
        }
        const history = await fetchHistoricalData(symbol, past7Days, now, '1d');
        results.push({
          symbol,
          name: quote.shortName || coin.name,
          dates: rtData.dates,
          prices: [price],
          history,
          change: quote.regularMarketChange,
          changePercentage: quote.regularMarketChangePercent,
          marketCap: quote.marketCap,
        });
      } catch (err) {
        console.error(`Error processing ${symbol}:`, err);
      }
    }
    if (underPrice !== undefined) {
      results = results.filter((r) => r.prices[0] < underPrice);
      return results.length > 0 ? results : [{ message: `No cryptocurrencies found with a price under ${underPrice}.` }];
    }
    return results;
  } catch (error) {
    console.error('Error fetching top cryptos:', error);
    return { error: 'Unable to fetch top cryptos' };
  }
}

/**
 * New Function: Fetch realtime market status using NSELive.
 */
async function getMarketStatus() {
  try {
    const status = await nseLive.marketStatus();
    return status;
  } catch (error) {
    console.error("Error fetching realtime market status:", error);
    return { error: "Unable to fetch realtime market status" };
  }
}

/**
 * New Function: Fetch trade information for one or more equities using NSELive.
 */
async function getTradeInfo({ symbols }) {
  try {
    // Validate that symbols is an array
    if (!symbols || !Array.isArray(symbols)) {
      throw new Error("The 'symbols' parameter must be an array of strings.");
    }

    // Create an array of promises for each symbol
    const tradeInfoPromises = symbols.map(async (symbol) => {
      const info = await nseLive.tradeInfo(symbol);
      return { symbol, info };
    });

    // Wait for all promises to resolve
    const tradeInfos = await Promise.all(tradeInfoPromises);
    return tradeInfos;
  } catch (error) {
    console.error(`Error fetching trade info:`, error);
    return { error: "Unable to fetch trade info" };
  }
}


/**
 * New Function: Fetch live F&O data for a specific equity using NSELive.
 */
async function getStockQuoteFNO({ symbols, optionsRequiredMonth }) {
  try {
    // Create an array of promises for each symbol
    const dataPromises = symbols.map(async (symbol) => {
      const rawData = await nseLive.stockQuoteFNO(symbol);
      // Process the rawData as done before:
      const underlyingValue = rawData.underlyingValue;
      const futuresData = [];
      const optionsData = [];

      if (Array.isArray(rawData.stocks)) {
        rawData.stocks.forEach((stock) => {
          const meta = stock.metadata;
          const orderBook = stock.marketDeptOrderBook;
          if (!meta || !orderBook) return; // Skip if essential data is missing

          const commonFields = {
            lastPrice: meta.lastPrice,
            change: meta.change,
            pChange: meta.pChange,
            contractsTraded: meta.numberOfContractsTraded,
            totalTurnover: meta.totalTurnover,
            openInterest: orderBook.tradeInfo ? orderBook.tradeInfo.openInterest : undefined,
            changeInOpenInterest: orderBook.tradeInfo ? orderBook.tradeInfo.changeinOpenInterest : undefined,
            pChangeInOpenInterest: orderBook.tradeInfo ? orderBook.tradeInfo.pchangeinOpenInterest : undefined,
            orderBook: {
              bid: orderBook.bid,
              ask: orderBook.ask,
            }
          };

          if (meta.instrumentType === 'Stock Futures') {
            futuresData.push({
              ...commonFields,
              volatility: {
                daily: orderBook.otherInfo ? orderBook.otherInfo.dailyvolatility : undefined,
                annualised: orderBook.otherInfo ? orderBook.otherInfo.annualisedVolatility : undefined,
                implied: orderBook.otherInfo ? orderBook.otherInfo.impliedVolatility : undefined
              }
            });
          } else if (meta.instrumentType === 'Stock Options') {
            if (optionsRequiredMonth && meta.expiryDate) {
              const parts = meta.expiryDate.split('-');
              if (parts.length < 2) return;
              const monthStr = parts[1];
              if (monthStr.toLowerCase() !== optionsRequiredMonth.toLowerCase()) return;
            }
            optionsData.push({
              optionType: meta.optionType,
              strikePrice: meta.strikePrice,
              expiryDate: meta.expiryDate,
              identifier: meta.identifier,
              ...commonFields,
              impliedVolatility: orderBook.otherInfo ? orderBook.otherInfo.impliedVolatility : undefined
            });
          }
        });
      }

      const limitedOptionsData = optionsData.slice(0, 3);

      return {
        symbol,
        underlyingValue,
        futuresData,
        optionsData: limitedOptionsData,
        fut_timestamp: rawData.fut_timestamp,
        opt_timestamp: rawData.opt_timestamp,
        info: rawData.info
      };
    });

    // Wait for all the promises to resolve
    const allData = await Promise.all(dataPromises);
    return allData;
  } catch (error) {
    console.error("Error fetching critical F&O data for multiple symbols:", error);
    return { error: "Unable to fetch F&O data" };
  }
}



/**
 * New Function: Fetch chart data for a given symbol using NSELive.
 */
async function getChartData({ symbol, includeAdditionalData }) {
  try {
    const data = await nseLive.chartData(symbol, includeAdditionalData);
    return data;
  } catch (error) {
    console.error(`Error fetching chart data for ${symbol}:`, error);
    return { error: "Unable to fetch chart data" };
  }
}

// /**
//  * New Function: Fetch market turnover data for a given symbol using NSELive.
//  */
// async function getMarketTurnover({ symbol }) {
//   try {
//     const data = await nseLive.marketTurnover(symbol);
//     return data;
//   } catch (error) {
//     console.error(`Error fetching market turnover for ${symbol}:`, error);
//     return { error: "Unable to fetch market turnover" };
//   }
// }

// /**
//  * New Function: Fetch equity derivative turnover data for a given symbol using NSELive.
//  */
// async function getEquityDerivativeTurnover({ symbol }) {
//   try {
//     const data = await nseLive.equityDerivativeTurnover(symbol);
//     return data;
//   } catch (error) {
//     console.error(`Error fetching equity derivative turnover for ${symbol}:`, error);
//     return { error: "Unable to fetch equity derivative turnover" };
//   }
// }

/**
 * New Function: Fetch data of all indices using NSELive.
 */
async function getAllIndices() {
  try {
    const data = await nseLive.allIndices();
    return data;
  } catch (error) {
    console.error("Error fetching all indices:", error);
    return { error: "Unable to fetch all indices" };
  }
}

/**
 * New Function: Fetch live index data for a given symbol using NSELive.
 */
async function getLiveIndex({ symbols }) {
  try {
    // 1. Get all indices data
    const allIndices = await getAllIndices();

    if (allIndices.error) {
      return { error: allIndices.error };
    }

    // 2. Filter indices based on user query
    const filteredData = allIndices.data.filter(index =>
      symbols.some(symbol =>
        index.index.toLowerCase() === symbol.toLowerCase() ||
        index.indexSymbol.toLowerCase() === symbol.toLowerCase()
      )
    );

    // 3. Handle no matches
    if (!filteredData.length) {
      return {
        error: "No matching indices found. Available indices: " +
          allIndices.data.map(d => d.index).join(', ')
      };
    }

    return filteredData;
  } catch (error) {
    console.error('Error fetching live index:', error);
    return { error: "Unable to fetch index data" };
  }
}


/**
 * NEW FUNCTION: Fetch top gainers, top losers, or both based on the user query.
 */
async function getGainersAndLosersData({ query }) {
  try {
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes("gainers") && lowerQuery.includes("losers")) {
      // Fetch both gainers and losers concurrently
      const [gainers, losers] = await Promise.all([
        nseLive.top10Gainers(),
        nseLive.top10Loosers()
      ]);
      return { gainers, losers };
    } else if (lowerQuery.includes("gainers")) {
      return await nseLive.top10Gainers();
    } else if (lowerQuery.includes("losers")) {
      return await nseLive.top10Loosers();
    } else {
      return { error: "Query not recognized. Please specify 'gainers', 'losers', or 'gainers and losers'." };
    }
  } catch (error) {
    console.error("Error fetching gainers and losers data:", error);
    return { error: "Unable to fetch gainers/losers data" };
  }
}

// Add a new helper function:
async function getVolumeGainers() {
  try {
    const data = await nseLive.volumeGainers();
    return data;
  } catch (error) {
    console.error("Error fetching volume gainers:", error);
    return { error: "Unable to fetch volume gainers data" };
  }
}

async function shouldPurchaseStocks({ symbols, period = '30days' }) {
  const now = new Date();
  let days;

  // Parse the period string to determine the number of days.
  if (typeof period === "string") {
    const lower = period.toLowerCase();
    const match = lower.match(/^(\d+)\s*(day|days|month|months|year|years)$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      if (unit.startsWith("day")) {
        days = value;
      } else if (unit.startsWith("month")) {
        days = value * 30; // Approximate conversion: 1 month ≈ 30 days
      } else if (unit.startsWith("year")) {
        days = value * 365; // Approximate conversion: 1 year ≈ 365 days
      }
    }
  }
  if (!days) {
    days = 30; // Default to 30 days if period is not valid.
  }

  // Calculate the start date based on the number of days.
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const recommendations = [];

  for (const symbol of symbols) {
    try {
      // Ensure symbol is in correct format for Indian stocks.
      const querySymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;

      // Fetch historical data over the period.
      const historicalData = await fetchHistoricalData(querySymbol, startDate, now, '1d');
      if (!historicalData || historicalData.length === 0) {
        recommendations.push({
          symbol: querySymbol,
          recommendation: "Insufficient historical data to provide a recommendation."
        });
        continue;
      }

      // Calculate the average closing price over the period.
      const total = historicalData.reduce((acc, item) => acc + item.price, 0);
      const averagePrice = total / historicalData.length;

      // Fetch current stock data.
      const currentData = await yahooFinance.quote(querySymbol);
      const currentPrice = currentData.regularMarketPrice;

      // Generate a recommendation.
      let recommendation = "";
      if (currentPrice < averagePrice * 0.98) {
        recommendation = "The current price is below the recent average, indicating a potential buying opportunity.";
      } else if (currentPrice > averagePrice * 1.02) {
        recommendation = "The current price is above the recent average, which may suggest it is overvalued at this time.";
      } else {
        recommendation = "The current price is close to the recent average; further analysis is recommended before purchasing.";
      }

      recommendations.push({
        symbol: querySymbol,
        currentPrice,
        averagePrice,
        recommendation,
        note: "This analysis is based solely on historical price data and is not personalized financial advice. Please consult a financial advisor before making any investment decisions."
      });
    } catch (error) {
      console.error(`Error processing ${symbol}:`, error);
      recommendations.push({
        symbol,
        recommendation: "Error processing data for this symbol."
      });
    }
  }

  return recommendations;
}








async function calculateStockROI(symbol, period) {
  let days;
  switch (period) {
    case '1month':
      days = 30;
      break;
    case '3month':
      days = 90;
      break;
    case '6month':
      days = 180;
      break;
    case '1year':
      days = 365;
      break;
    default:
      throw new Error('Invalid period specified');
  }

  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    // Normalize the symbol to follow the Indian market convention if needed.
    let querySymbol = symbol;
    if (!symbol.includes('.') && /^[A-Z]+$/.test(symbol)) {
      querySymbol = `${symbol}.NS`;
    }
    // Fetch historical data for the computed period. Assume this function returns an array of data points sorted by date.
    const history = await fetchHistoricalData(querySymbol, startDate, now, '1d');
    if (!history || history.length === 0) {
      return { symbol, error: 'No historical data available for the specified period' };
    }
    // Assume the first entry is the earliest price and the last entry is the most recent.
    const startPrice = history[0].price;
    const endPrice = history[history.length - 1].price;
    const roi = ((endPrice - startPrice) / startPrice) * 100;
    return { symbol: querySymbol, period, startPrice, endPrice, roi };
  } catch (error) {
    console.error(`Error calculating ROI for ${symbol}:`, error);
    return { symbol, error: 'Unable to calculate ROI' };
  }
}





async function getHighestReturnStock(args) {
  const { period } = args;
  const urlMap = {
    '1month': 'https://www.screener.in/screens/300202/stocks-with-good-1-month-returns/?sort=return+over+1month&order=desc',
    '3month': 'https://www.screener.in/screens/355769/highest-return-in-3-months/?sort=return+over+3months&order=desc',
    '6month': 'https://www.screener.in/screens/264786/highest-returns-in-six-months/',
    '1year': 'https://www.screener.in/screens/355766/highest-return-in-1-year/'
  };
  const periodKeyMap = {
    '1month': '1M Return %',
    '3month': '3M Return %',
    '6month': '6M Return %',
    '1year': '1Y Return %'
  };

  try {
    const response = await axios.get(urlMap[period], {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "en-US,en;q=0.9",
      }
    });

    const $ = load(response.data);
    const table = $('div.responsive-holder.fill-card-width table.data-table');
    if (!table.length) return { error: "No table found" };

    const scrapedData = [];
    table.find('tbody tr').each((index, row) => {
      const cols = $(row).find('td');
      if (!cols.length) return;

      // Extract details from each row. Adjust indexes if necessary.
      const stockName = $(cols[1]).text().trim();
      const returnText = $(cols).last().text().trim();
      const returnValue = parseFloat(returnText);

      scrapedData.push({
        name: stockName,
        [periodKeyMap[period]]: returnValue
      });
    });

    // Return the full scraped data array
    return scrapedData;
  } catch (error) {
    console.error("Error in getHighestReturnStock:", error);
    return { error: error.message };
  }
}








//sudo apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libx11-xcb1 libgtk-3-0 libasound2t64 libnss3 libxss1 libxcomposite1 libxrandr2 libgbm1

async function getBestStocksUnderPrice(args) {
  const { minPrice, maxPrice, maxMarketCap } = args;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  // Inline helper function to parse market cap values
  const parseMarketCap = (marketCapText) => {
    if (!marketCapText) return null;
    // Handle "Lakh Cr." format (e.g., "1 Lakh Cr." = 100,000 Cr.)
    if (marketCapText.includes('Lakh')) {
      const value = parseFloat(marketCapText.replace(' Lakh Cr.', '').replace(/,/g, ''));
      return value * 100000; // Convert Lakh Cr. to Cr.
    }
    // Handle "Cr." format (e.g., "1,000 Cr." = 1000 Cr.)
    if (marketCapText.includes('Cr.')) {
      return parseFloat(marketCapText.replace(' Cr.', '').replace(/,/g, ''));
    }
    const parsedValue = parseFloat(marketCapText.replace(/,/g, ''));
    return isNaN(parsedValue) ? null : parsedValue;
  };

  try {
    // Navigate to Screener.in login page
    await page.goto('https://www.screener.in/login/', { waitUntil: 'networkidle2' });

    // Enter login credentials
    await page.type('input[name="username"]', process.env.SCREENER_USERNAME, { delay: 100 });
    await page.type('input[name="password"]', process.env.SCREENER_PASSWORD, { delay: 100 });

    // Click the login button and wait for navigation
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);

    console.log('Login successful');

    // Construct query parts
    const queryParts = [
      "Sales growth 3Years > 10",
      "Profit growth 3Years > 10",
      "Debt to equity < 0.5",
    ];

    // Price condition
    if (minPrice !== undefined) {
      queryParts.push(`Current price > ${minPrice} AND Current price < ${maxPrice}`);
    } else {
      queryParts.push(`Current price < ${maxPrice}`);
    }

    queryParts.push("Sales > 500");

    // Market Cap condition
    if (maxMarketCap !== undefined) {
      queryParts.push(`Market Capitalization < ${maxMarketCap}`);
    }

    // Encode query
    const query = queryParts.join(" AND\r\n");
    const encodedQuery = encodeURIComponent(query)
      .replace(/%20/g, '+')
      .replace(/%0D%0A/g, '%0D%0A');

    const url = `https://www.screener.in/screen/raw/?sort=&order=&source_id=&query=${encodedQuery}`;
    console.log('Navigating to URL:', url);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('div.responsive-holder.fill-card-width table.data-table tbody tr');

    const html = await page.content();
    const $ = load(html); // Ensure Cheerio is imported: const { load } = require('cheerio');

    const stocks = [];
    $('div.responsive-holder.fill-card-width table.data-table tbody tr').each((index, row) => {
      const cols = $(row).find('td');
      if (cols.length < 14) return;

      const marketCapText = $(cols[4]).text().trim();
      const marketCapValue = parseMarketCap(marketCapText);

      const stockData = {
        name: $(cols[1]).find('a').text().trim(),
        url: `https://www.screener.in${$(cols[1]).find('a').attr('href')}`,
        cmp: parseFloat($(cols[2]).text().trim().replace(/,/g, '')),
        peRatio: parseFloat($(cols[3]).text().trim()),
        marketCap: marketCapText,
        marketCapValue: marketCapValue,
        salesVar3Yrs: parseFloat($(cols[11]).text().trim()),
        profitVar3Yrs: parseFloat($(cols[12]).text().trim()),
        debtToEquity: parseFloat($(cols[13]).text().trim())
      };

      stocks.push(stockData);
    });

    // Post-filtering for accuracy
    let filteredStocks = stocks;
    if (minPrice !== undefined) {
      filteredStocks = filteredStocks.filter(stock => stock.cmp > minPrice);
    }
    if (maxPrice !== undefined) {
      filteredStocks = filteredStocks.filter(stock => stock.cmp < maxPrice);
    }
    if (maxMarketCap !== undefined) {
      filteredStocks = filteredStocks.filter(stock => stock.marketCapValue <= maxMarketCap);
    }

    return filteredStocks;

  } catch (error) {
    console.error('Error:', error);
    return { error: error.message };
  } finally {
    await browser.close();
  }
}











async function getOptionChainData({ symbol, strikePrice, optionType, expiryDate }) {
  try {
    // Fetch cookies required by NSE
    const cookieResponse = await axios.get('https://www.nseindia.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const cookies = cookieResponse.headers['set-cookie'];
    const cookieHeader = cookies ? cookies.join('; ') : '';

    // Fetch option chain data
    const url = `https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/',
        'Cookie': cookieHeader,
      },
    });

    const data = response.data;

    // Get current date and filter out expired dates
    const currentMoment = moment();
    const validExpiryDates = data.records.expiryDates
      .map(expiry => moment(expiry, 'DD-MMM-YYYY', true))
      .filter(expiryMoment => expiryMoment.isSameOrAfter(currentMoment, 'day'))
      .sort((a, b) => a - b) // Sort ascending
      .map(m => m.format('DD-MMM-YYYY'));

    if (!validExpiryDates.length) return { error: "No future expiries available" };

    // Parse user-provided expiryDate
    let targetExpiry;
    if (expiryDate) {
      const parsedExpiry = moment(expiryDate, ['DD-MMM-YYYY', 'MMM YYYY', 'MMM'], true);
      if (parsedExpiry.isValid()) {
        // Find the closest expiry date
        targetExpiry = validExpiryDates.find(date =>
          moment(date, 'DD-MMM-YYYY').isSameOrAfter(parsedExpiry)
        ) || validExpiryDates[0]; // Fallback to nearest expiry
      } else {
        targetExpiry = validExpiryDates[0]; // Fallback to nearest expiry
      }
    } else {
      targetExpiry = validExpiryDates[0]; // Nearest expiry
    }

    // Find the closest strike price
    const strikePrices = data.records.data
      .filter(item => item.expiryDate === targetExpiry)
      .map(item => item.strikePrice);

    const closestStrike = strikePrices.reduce((prev, curr) =>
      Math.abs(curr - strikePrice) < Math.abs(prev - strikePrice) ? curr : prev
    );

    // Find the matching entry
    const entry = data.records.data.find(item =>
      item.strikePrice === closestStrike &&
      item.expiryDate === targetExpiry
    );

    if (!entry) return { error: 'No data for specified strike/expiry' };

    // Process and return the option data
    const optionData = entry[optionType];
    if (!optionData) return { error: 'Option type not found' };

    // Calculate moneyness
    const underlyingPrice = optionData.underlyingValue;
    const isInTheMoney = optionType === 'PE'
      ? strikePrice >= underlyingPrice
      : strikePrice <= underlyingPrice;

    // Generate recommendation
    const recommendation = generateRecommendation(optionData, optionType);

    return {
      symbol,
      strikePrice: closestStrike,
      optionType,
      expiryDate: targetExpiry,
      openInterest: optionData.openInterest,
      changeinOpenInterest: optionData.changeinOpenInterest,
      pChangeInOI: optionData.pchangeinOpenInterest,
      lastPrice: optionData.lastPrice,
      impliedVolatility: optionData.impliedVolatility,
      underlyingValue: underlyingPrice,
      moneyness: isInTheMoney ? 'In-the-money' : 'Out-of-the-money',
      recommendation
    };

  } catch (error) {
    console.error('Error fetching option data:', error);
    return { error: 'Failed to fetch option chain data' };
  }
}

function generateRecommendation(optionData, optionType) {
  const underlying = optionData.underlyingValue;
  const strike = optionData.strikePrice;
  const isInTheMoney = optionType === 'PE'
    ? strike >= underlying
    : strike <= underlying;

  // Moneyness recommendation
  let moneynessRecommendation = '';
  if (optionType === 'PE') {
    moneynessRecommendation = isInTheMoney
      ? "The put option is in-the-money, providing intrinsic value."
      : "The put option is out-of-the-money; a significant move downward in the underlying index is required to profit.";
  } else {
    moneynessRecommendation = isInTheMoney
      ? "The call option is in-the-money, providing intrinsic value."
      : "The call option is out-of-the-money; the underlying index must move higher for profitability.";
  }

  // Open Interest analysis
  const oiTrend = optionData.changeinOpenInterest > 0
    ? "The increasing open interest indicates that more traders are entering this position, suggesting emerging sentiment."
    : "The decreasing open interest might indicate waning trader interest.";

  // Implied Volatility assessment
  const volatilityStatus = optionData.impliedVolatility > 40
    ? "The high implied volatility suggests that the option premium may be inflated due to market uncertainty."
    : "The implied volatility is within a normal range, implying fair pricing of the option.";

  // Risk–Reward Ratio Analysis
  const riskRewardRatio = (underlying / strike).toFixed(2);
  const riskRewardRecommendation = riskRewardRatio > 1
    ? "A significant move in the underlying asset is needed to make the option profitable."
    : "The risk/reward balance appears acceptable given the current market conditions.";

  // Overall Recommendation Statement
  const overallRecommendation = `
Recommendation for ${optionData.underlying} ${strike} ${optionType === 'PE' ? 'Put' : 'Call'} Option:
- Moneyness: ${moneynessRecommendation}
- Open Interest: ${oiTrend}
- Implied Volatility: ${volatilityStatus}
- Risk/Reward: ${riskRewardRecommendation}

Overall, if you have a strong directional view (for example, expecting a bearish trend for a put option) and the market conditions align with these signals, this option might serve as a good speculative or hedging play. Otherwise, consider waiting for clearer indicators or exploring other strike levels.
  `;

  return overallRecommendation;
}


// /**
//  * New Function: Fetch index option chain for a given symbol using NSELive.
//  */
// async function getIndexOptionChain({ symbol }) {
//   try {
//     const data = await nseLive.indexOptionChain(symbol);
//     const logEntry = [
//       `Timestamp: ${new Date().toISOString()}`,
//       `Symbol: ${symbol}`,
//       `Futures Data: ${JSON.stringify(data, null, 2)}`,
//       '-------------------------\n'
//     ].join('\n');

//     fs.appendFile('InOPChain.log', logEntry, (err) => {
//       if (err) {
//         console.error('Error writing F&O data to file:', err);
//       }
//     });

//     return data;
//   } catch (error) {
//     console.error(`Error fetching index option chain for ${symbol}:`, error);
//     return { error: "Unable to fetch index option chain" };
//   }
// }

/**
 * Fetch company information from MongoDB Atlas.
 */
async function getCompanyInfo(args) {
  let category = args?.category || 'all';
  if (category === 'subscription') {
    category = 'pricing';
  }
  const companyDoc = await CompanyInfo.findOne({ name: 'Profit Flow' }).lean();
  if (!companyDoc) {
    throw new Error('Company information not found in the database.');
  }
  return category === 'all' ? companyDoc : { [category]: companyDoc[category] };
}

export async function POST(request) {
  try {
    const { messages } = await request.json();
    const userId = 'static-user-123'; // Replace with dynamic user ID in real app

    // Fetch user's previous reports
    const userLog = await UserChatLog.findOne({ userId });
    const reports = [];
    if (userLog) {
      userLog.messages.forEach(msg => {
        if (msg.actions?.report) {
          reports.push(msg.actions.reportMessage);
        }
      });
    }

    // Call OpenAI to get the initial assistant response.
    const initialResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `
You are a helpful, reliable assistant based in Chhatrapati Sambhajinagar (formerly Aurangabad), Maharashtra. 
You ONLY provide accurate, up-to-date information related to:
- The city of Chhatrapati Sambhajinagar
- Local history, culture, events, tourism, and public transport
- Chhatrapati Sambhajinagar Municipal Corporation (CSMC), including wards, corporators, civic services, elections, and infrastructure

Do NOT answer any questions outside this scope (such as other cities, countries, general knowledge, finance, etc.). 
If asked about anything unrelated, politely reply: 
"I'm only able to help with topics related to Chhatrapati Sambhajinagar and its Municipal Corporation (CSMC)."

Answer clearly and factually, and use local references where helpful.
      `.trim(),
        },
        ...messages,
      ],
      functions,
      function_call: 'auto',
    });
    const message = initialResponse.choices[0].message;
    console.log(message);


    // If OpenAI requested a function call, process that.
    if (message.function_call) {
      const functionName = message.function_call.name;
      const args = JSON.parse(message.function_call.arguments || '{}');
      let functionResponse;

      // Dispatch to the appropriate helper function.
      switch (functionName) {
        case 'get_stock_price':
          functionResponse = await getStockPrice(args.symbols, args.underPrice);
          break;
        case 'get_top_stocks':
          functionResponse = await getTopStocks(args.limit || 2, args.underPrice);
          break;
        case 'get_crypto_price':
          functionResponse = await getCryptoPrice(args.symbols, args.currency || 'USD', args.underPrice);
          break;
        case 'get_top_cryptos':
          functionResponse = await getTopCryptos(args.limit || 2, args.currency || 'USD', args.underPrice);
          break;
        case 'get_company_info':
          functionResponse = await getCompanyInfo(args);
          break;
        case 'get_market_status':
          functionResponse = await getMarketStatus();
          break;
        // New cases for additional NSELive endpoints:
        case 'get_trade_info':
          functionResponse = await getTradeInfo(args);
          break;
        case 'get_stock_quote_fno':
          functionResponse = await getStockQuoteFNO(args);
          break;
        case 'get_chart_data':
          functionResponse = await getChartData(args);
          break;
        case 'get_gainers_and_losers':
          functionResponse = await getGainersAndLosersData(args);
          break;
        case 'get_volume_gainers':
          functionResponse = await getVolumeGainers();
          break;
        case 'should_purchase_stock':
          functionResponse = await shouldPurchaseStocks(args);
          break;
        case 'calculate_stock_roi':
          functionResponse = await calculateStockROI(args.symbol, args.period);
          break;
        case 'get_highest_return_stock':
          functionResponse = await getHighestReturnStock(args);
          break;
        case 'get_best_stocks_under_price':
          functionResponse = await getBestStocksUnderPrice(args);
          break;
        // case 'get_market_turnover':
        //   functionResponse = await getMarketTurnover(args);
        //   break;
        // case 'get_equity_derivative_turnover':
        //   functionResponse = await getEquityDerivativeTurnover(args);
        //   break;
        case 'get_all_indices':
          functionResponse = await getAllIndices();
          break;
        case 'get_live_index':
          functionResponse = await getLiveIndex(args);
          break;
        case 'get_option_chain_data':
          functionResponse = await getOptionChainData(args);
          break;
        // case 'get_index_option_chain':
        //   if (!args.symbol || args.symbol.trim() === "") {
        //     args.symbol = "NIFTY";
        //   }
        //   functionResponse = await getIndexOptionChain(args);
        //   break;
        default:
          functionResponse = { error: 'Function not supported' };
      }
      // Process chart data: compute a 15-day SMA for each asset
      if (functionResponse && Array.isArray(functionResponse) && functionResponse.length > 0) {
        if (functionResponse[0].history && functionResponse[0].history.length > 0) {
          const labels = functionResponse[0].history.map((item) =>
            new Date(item.date).toLocaleDateString()
          );
          const priceDatasets = [];
          functionResponse.forEach((asset, index) => {
            const priceData = asset.history.map((item) => item.price);
            const datasetColor = `hsl(${(index * 360) / functionResponse.length}, 70%, 50%)`;
            priceDatasets.push({
              label: asset.symbol || asset.name || `Asset ${index + 1}`,
              data: priceData,
              fill: false,
              borderColor: datasetColor,
              backgroundColor: datasetColor,
              tension: 0.1,
            });
            if (priceData.length > 0) {
              // Compute a 15-day SMA (cumulative average if fewer than 15 days)
              const sma15 = calculateSMA(priceData, 15);
              priceDatasets.push({
                label: `${asset.symbol || asset.name} 15-Day SMA`,
                data: sma15,
                fill: false,
                borderColor: "yellow",
                borderDash: [5, 5],
                tension: 0.1,
              });
            }
            const volumeData = asset.history.map((item) => item.volume);
            priceDatasets.push({
              label: `${asset.symbol || asset.name} Volume`,
              data: volumeData,
              type: 'bar',
              yAxisID: 'volume-y-axis',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              borderColor: 'rgba(75, 192, 192, 1)',
              borderWidth: 1,
              order: 0, // Draw volume behind other datasets
            });
          });
          const chartData = { labels, datasets: priceDatasets };
          functionResponse.chartData = chartData;
          functionResponse.chartTitle = `${functionResponse
            .map((item) => item.symbol)
            .join(" & ")} Price History`;
        }
      }

      let finalResponse;
      if (functionName === "get_company_info") {
        finalResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            ...messages,
            {
              role: "system",
              content:
                "You are a friendly advisor providing company information. Keep your response clear, concise, and conversational. Limit your answer to under three paragraphs and include any offers naturally.",
            },
            {
              role: "user",
              content: `Company Data:\n${JSON.stringify(functionResponse, null, 2)}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        });
      } else {
        const responseTemplate = `Please generate a creative and professional financial update using the data provided below.
Data:
${JSON.stringify(functionResponse, null, 2)}

Ensure your response is engaging, well-structured, and adapts to the query context without using tables.`;
        finalResponse = await openai.chat.completions.create({
          model: "gpt-4o", //ft:gpt-4o-mini-2024-07-18:profit-millionaire:justtest:B3gYFq2m
          messages: [
            ...messages,
            {
              role: "system",
              content: `
You are a helpful, reliable assistant based in **Chhatrapati Sambhajinagar**, Maharashtra. 
You specialize in providing accurate, up-to-date information strictly related to:

- Chhatrapati Sambhajinagar city (formerly Aurangabad)
- Local tourism, culture, transport, education, events, and history
- Chhatrapati Sambhajinagar Municipal Corporation (CSMC), including wards, corporators, services, complaints, taxes, elections, and city development

❗ You must NOT answer questions unrelated to Chhatrapati Sambhajinagar or CSMC.
If a user asks about another city, topic, or domain, respond politely with:
"I'm only able to assist with topics related to Chhatrapati Sambhajinagar and its Municipal Corporation (CSMC)."

Stay factual, concise, and use a respectful local tone.
      `.trim(),
            },
            {
              role: "user",
              content: responseTemplate,
            },
          ],
          temperature: 0.6,
          max_tokens: 1000,
        });
      }
      console.log(reports);
      return NextResponse.json({
        ...finalResponse.choices[0].message,
        rawData: functionResponse,
        functionName: message.function_call.name,
      });
    } else {
      return NextResponse.json({
        role: "assistant",
        content:
          message.content ||
          "I'm here to help! Could you please clarify your request?",
      });
    }
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      {
        error: "Financial data currently unavailable. Please try again later.",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}