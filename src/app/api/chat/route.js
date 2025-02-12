// src/app/api/chat/route.js

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import CompanyInfo from '@/src/models/CompanyInfo';
import dotenv from 'dotenv';
import yahooFinance from 'yahoo-finance2';
import UserChatLog from '@/src/models/UserChatLog';
import axios from 'axios';
import { NSELive, NSEArchive } from 'nse-api-package'; // New: Import NSELive and NSEArchive

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
        symbol: {
          type: 'string',
          description: 'Stock symbol for which to fetch trade information.',
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
        symbol: {
          type: 'string',
          description: 'Stock symbol for which to fetch F&O data.',
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
  // {
  //   name: 'get_all_indices',
  //   description: 'Fetch data of all indices using NSELive.',
  //   parameters: {
  //     type: 'object',
  //     properties: {}
  //   },
  // },
  {
    name: 'get_live_index',
    description: 'Fetch realtime index data for a given symbol using NSELive.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Index symbol for which to fetch realtime data.',
        },
      },
      required: ['symbol'],
    },
  },
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
 * New Function: Fetch trade information for a specific equity using NSELive.
 */
async function getTradeInfo({ symbol }) {
  try {
    const info = await nseLive.tradeInfo(symbol);
    return info;
  } catch (error) {
    console.error(`Error fetching trade info for ${symbol}:`, error);
    return { error: "Unable to fetch trade info" };
  }
}

/**
 * New Function: Fetch live F&O data for a specific equity using NSELive.
 */
async function getStockQuoteFNO({ symbol, optionsRequiredMonth }) {
  try {
    // Fetch raw data from the NSELive API
    const rawData = await nseLive.stockQuoteFNO(symbol);

    // The underlying asset's current value (common for both futures and options)
    const underlyingValue = rawData.underlyingValue;

    // Initialize arrays to hold processed futures and options data
    const futuresData = [];
    const optionsData = [];

    // Process each contract in the raw data
    if (Array.isArray(rawData.stocks)) {
      rawData.stocks.forEach((stock) => {
        const meta = stock.metadata;
        const orderBook = stock.marketDeptOrderBook;
        if (!meta || !orderBook) return; // skip if essential data is missing

        // Prepare a base object with fields common to both types:
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

        // Process Futures: Critical fields include underlying value, price, volume, OI, order book, and volatility measures.
        if (meta.instrumentType === 'Stock Futures') {
          futuresData.push({
            ...commonFields,
            volatility: {
              daily: orderBook.otherInfo ? orderBook.otherInfo.dailyvolatility : undefined,
              annualised: orderBook.otherInfo ? orderBook.otherInfo.annualisedVolatility : undefined,
              // For futures the implied volatility might be absent or zero
              implied: orderBook.otherInfo ? orderBook.otherInfo.impliedVolatility : undefined
            }
          });
        }
        // Process Options: Critical fields include contract details plus pricing, OI, order book, and implied volatility.
        else if (meta.instrumentType === 'Stock Options') {
          // If a required month is specified, filter by the expiry month.
          if (optionsRequiredMonth && meta.expiryDate) {
            // Assume expiryDate is in "DD-MMM-YYYY" format (e.g., "27-Feb-2025")
            const parts = meta.expiryDate.split('-');
            if (parts.length < 2) return;
            const monthStr = parts[1];
            if (monthStr.toLowerCase() !== optionsRequiredMonth.toLowerCase()) return;
          }
          optionsData.push({
            optionType: meta.optionType,         // "Call" or "Put"
            strikePrice: meta.strikePrice,
            expiryDate: meta.expiryDate,
            identifier: meta.identifier,
            ...commonFields,
            impliedVolatility: orderBook.otherInfo ? orderBook.otherInfo.impliedVolatility : undefined
          });
        }
      });
    }

    // Limit options data to the first three contracts (if more than three are returned)
    const limitedOptionsData = optionsData.slice(0, 3);
    // Return an object containing the underlying value, futures data, and options data.
    return {
      underlyingValue,
      futuresData,
      optionsData: limitedOptionsData,
      fut_timestamp: rawData.fut_timestamp,
      opt_timestamp: rawData.opt_timestamp,
      info: rawData.info
    };
  } catch (error) {
    console.error(`Error fetching critical F&O data for ${symbol}:`, error);
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

// /**
//  * New Function: Fetch data of all indices using NSELive.
//  */
// async function getAllIndices() {
//   try {
//     const data = await nseLive.allIndices();
//     return data;
//   } catch (error) {
//     console.error("Error fetching all indices:", error);
//     return { error: "Unable to fetch all indices" };
//   }
// }

/**
 * New Function: Fetch live index data for a given symbol using NSELive.
 */
async function getLiveIndex({ symbol }) {
  try {
    const data = await nseLive.liveIndex(symbol);
    return data;
  } catch (error) {
    console.error(`Error fetching live index for ${symbol}:`, error);
    return { error: "Unable to fetch live index" };
  }
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
          content:
            "You are a highly specialized financial analyst assistant focused exclusively on Indian stocks and crypto analysis. Provide responses in structured markdown format with clear bullet points, proper spacing between topics, and dynamic chart headings based on the query. Respond in a professional tone and include relevant suggestions when applicable.\n\n" +
            "STRICT RULES:\n" +
            "- Do not answer any off-topic questions that do not pertain directly to stock or crypto analysis. If a user submits an off-topic query, politely indicate that you can only assist with financial market analysis.\n" +
            "- Do not provide any details about the underlying code, API usage, or built-in systems. If asked technical questions about the implementation (e.g., which API is used for real-time stock prices), respond with a standard refusal message such as 'I'm sorry, but I cannot disclose details about my internal systems.'\n",
        },
        ...messages,
      ],
      functions,
      function_call: 'auto',
    });
    const message = initialResponse.choices[0].message;

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
        // case 'get_market_turnover':
        //   functionResponse = await getMarketTurnover(args);
        //   break;
        // case 'get_equity_derivative_turnover':
        //   functionResponse = await getEquityDerivativeTurnover(args);
        //   break;
        // case 'get_all_indices':
        //   functionResponse = await getAllIndices();
        //   break;
        case 'get_live_index':
          functionResponse = await getLiveIndex(args);
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
          model: "gpt-4o",
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
          model: "gpt-4o",
          messages: [
            ...messages,
            {
              role: "system",
              content:
                "You are a highly specialized financial analyst assistant focused exclusively on Indian stocks and crypto analysis. Provide responses in structured markdown format using clear headings and full sentences that form a cohesive narrative. Respond in a professional tone and include relevant suggestions when applicable.\n\n" +
                "STRICT RULES:\n" +
                "- Keep response under 100 words.\n" +
                "- Tailor your language based on the user's technical tone: If the user communicates in a non-technical way, provide clear and simple explanations; if the user uses technical language, adopt a more detailed explanation.\n" +
                "- Provide only the data that is directly relevant to the query. Avoid including excessive or extraneous information.\n" +
                "- Highlight essential data points, such as **current price**, in bold and present all related details in a clear and concise manner.\n" +
                "Based on the provided input data, generate an in-depth market analysis report that dynamically identifies all significant metrics. Include a detailed explanation of what each metric represents, why it is important, and its implications for investors, along with additional context such as trend analysis, comparisons, or potential risks.\n" +
                "Ensure your response goes beyond simply listing data points by including clear, explanatory sentences and a narrative that ties the data together. Use markdown headings (like '## Company Profile' and '## Key Financial Metrics') to organize the information. Add numbering with bullet points for heading and subheadings\n" +
                (reports.length > 0
                  ? `User feedback to consider: ${reports.slice(-3).join(". ")}. Address these concerns appropriately.\n\n`
                  : "")
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