// export async function POST(request) {
//   try {
//     const { messages } = await request.json();
//     const userId = 'static-user-123'; // Replace with dynamic user ID in real app

//     // Fetch user's previous reports (feedback data)
//     const userLog = await UserChatLog.findOne({ userId });
//     const reports = [];
//     if (userLog) {
//       userLog.messages.forEach(msg => {
//         if (msg.actions?.report) {
//           reports.push(msg.actions.reportMessage);
//         }
//       });
//     }

//     // --- Step 1: Call OpenAI to get the initial assistant response (Model 1: Auto Function Caller) ---
//     const initialResponse = await openai.chat.completions.create({
//       model: 'gpt-4o-mini',
//       messages: [
//         {
//           role: 'system',
//           content:
//             "You are a highly specialized financial analyst assistant for company 'profit flow' focused exclusively on Indian stocks and crypto analysis. Provide responses in structured markdown format with clear bullet points, proper spacing between topics, and dynamic chart headings based on the query. Respond in a professional tone and include relevant suggestions when applicable.\n\n",
//         },
//         ...messages,
//       ],
//       functions,
//       function_call: 'auto',
//     });
//     const message = initialResponse.choices[0].message;
    
//     // --- Step 2: Process Function Call (if applicable) ---
//     if (message.function_call) {
//       const functionName = message.function_call.name;
//       const args = JSON.parse(message.function_call.arguments || '{}');
//       let functionResponse;

//       // Dispatch to the appropriate helper function.
//       switch (functionName) {
//         case 'get_stock_price':
//           functionResponse = await getStockPrice(args.symbols, args.underPrice);
//           break;
//         case 'get_top_stocks':
//           functionResponse = await getTopStocks(args.limit || 2, args.underPrice);
//           break;
//         case 'get_crypto_price':
//           functionResponse = await getCryptoPrice(args.symbols, args.currency || 'USD', args.underPrice);
//           break;
//         case 'get_top_cryptos':
//           functionResponse = await getTopCryptos(args.limit || 2, args.currency || 'USD', args.underPrice);
//           break;
//         case 'get_company_info':
//           functionResponse = await getCompanyInfo(args);
//           break;
//         case 'get_market_status':
//           functionResponse = await getMarketStatus();
//           break;
//         // Additional NSELive endpoints:
//         case 'get_trade_info':
//           functionResponse = await getTradeInfo(args);
//           break;
//         case 'get_stock_quote_fno':
//           functionResponse = await getStockQuoteFNO(args);
//           break;
//         case 'get_chart_data':
//           functionResponse = await getChartData(args);
//           break;
//         case 'get_gainers_and_losers':
//           functionResponse = await getGainersAndLosersData(args);
//           break;
//         case 'get_volume_gainers':
//           functionResponse = await getVolumeGainers();
//           break;
//         case 'should_purchase_stock':
//           functionResponse = await shouldPurchaseStocks(args);
//           break;
//         case 'calculate_stock_roi':
//           functionResponse = await calculateStockROI(args.symbol, args.period);
//           break;
//         case 'get_highest_return_stock':
//           functionResponse = await getHighestReturnStock(args);
//           break;
//         case 'get_best_stocks_under_price':
//           functionResponse = await getBestStocksUnderPrice(args);
//           break;
//         case 'get_all_indices':
//           functionResponse = await getAllIndices();
//           break;
//         case 'get_live_index':
//           functionResponse = await getLiveIndex(args);
//           break;
//         case 'get_option_chain_data':
//           functionResponse = await getOptionChainData(args);
//           break;
//         default:
//           functionResponse = { error: 'Function not supported' };
//       }
      
//       // Process chart data: compute a 15-day SMA for each asset (if applicable)
//       if (functionResponse && Array.isArray(functionResponse) && functionResponse.length > 0) {
//         if (functionResponse[0].history && functionResponse[0].history.length > 0) {
//           const labels = functionResponse[0].history.map((item) =>
//             new Date(item.date).toLocaleDateString()
//           );
//           const priceDatasets = [];
//           functionResponse.forEach((asset, index) => {
//             const priceData = asset.history.map((item) => item.price);
//             const datasetColor = `hsl(${(index * 360) / functionResponse.length}, 70%, 50%)`;
//             priceDatasets.push({
//               label: asset.symbol || asset.name || `Asset ${index + 1}`,
//               data: priceData,
//               fill: false,
//               borderColor: datasetColor,
//               backgroundColor: datasetColor,
//               tension: 0.1,
//             });
//             if (priceData.length > 0) {
//               // Compute a 15-day SMA (cumulative average if fewer than 15 days)
//               const sma15 = calculateSMA(priceData, 15);
//               priceDatasets.push({
//                 label: `${asset.symbol || asset.name} 15-Day SMA`,
//                 data: sma15,
//                 fill: false,
//                 borderColor: "yellow",
//                 borderDash: [5, 5],
//                 tension: 0.1,
//               });
//             }
//             const volumeData = asset.history.map((item) => item.volume);
//             priceDatasets.push({
//               label: `${asset.symbol || asset.name} Volume`,
//               data: volumeData,
//               type: 'bar',
//               yAxisID: 'volume-y-axis',
//               backgroundColor: 'rgba(75, 192, 192, 0.2)',
//               borderColor: 'rgba(75, 192, 192, 1)',
//               borderWidth: 1,
//               order: 0,
//             });
//           });
//           const chartData = { labels, datasets: priceDatasets };
//           functionResponse.chartData = chartData;
//           functionResponse.chartTitle = `${functionResponse
//             .map((item) => item.symbol)
//             .join(" & ")} Price History`;
//         }
//       }

//       let finalResponse;
//       if (functionName === "get_company_info") {
//         finalResponse = await openai.chat.completions.create({
//           model: "gpt-4o-mini",
//           messages: [
//             ...messages,
//             {
//               role: "system",
//               content:
//                 "You are a friendly advisor providing company information. Keep your response clear, concise, and conversational. Limit your answer to under three paragraphs and include any offers naturally.",
//             },
//             {
//               role: "user",
//               content: `Company Data:\n${JSON.stringify(functionResponse, null, 2)}`,
//             },
//           ],
//           temperature: 0.7,
//           max_tokens: 500,
//         });
//       } else {
//         const responseTemplate = `Please generate a creative and professional financial update using the data provided below.
// Data:
// ${JSON.stringify(functionResponse, null, 2)}

// Ensure your response is engaging, well-structured, and adapts to the query context without using tables.`;
//         finalResponse = await openai.chat.completions.create({
//           model: "gpt-4o-mini",
//           messages: [
//             ...messages,
//             {
//               role: "system",
//               content:
//                 "You are a highly specialized financial analyst assistant focused exclusively on Indian stocks and crypto analysis. Provide responses in structured markdown format using clear headings and full sentences that form a cohesive narrative. Respond in a professional tone and include relevant suggestions when applicable.\n\n" +
//                 "STRICT RULES:\n" +
//                 "- Keep response under 100 words.\n" +
//                 "- Tailor your language based on the user's technical tone: If the user communicates in a non-technical way, provide clear and simple explanations; if the user uses technical language, adopt a more detailed explanation.\n" +
//                 "- Provide only the data that is directly relevant to the query. Avoid including excessive or extraneous information.\n" +
//                 "- Highlight essential data points, such as **current price**, in bold and present all related details in a clear and concise manner.\n" +
//                 "Based on the provided input data, generate an in-depth market analysis report that dynamically identifies all significant metrics. Include a detailed explanation of what each metric represents, why it is important, and its implications for investors, along with additional context such as trend analysis, comparisons, or potential risks.\n" +
//                 "Ensure your response goes beyond simply listing data points by including clear, explanatory sentences and a narrative that ties the data together. Use markdown headings (like '## Company Profile' and '## Key Financial Metrics') to organize the information. Add numbering with bullet points for heading and subheadings.\n" +
//                 (reports.length > 0
//                   ? `User feedback to consider: ${reports.slice(-3).join(". ")}. Address these concerns appropriately.\n\n`
//                   : "")
//             },
//             {
//               role: "user",
//               content: responseTemplate,
//             },
//           ],
//           temperature: 0.6,
//           max_tokens: 1000,
//         });
//       }
      
//       // --- Step 3: Refine Final Response Using Fine-Tuned Model (Model 3) ---
//       // Here, we pass the output from the finalResponse generation to our fine-tuned model
//       // which has been trained on global feedback data to further refine the answer.
//       const finalGeneratedMessage = finalResponse.choices[0].message;
//       console.log("Intermediate final response:", finalGeneratedMessage.content);
      
//       const refinedResponse = await openai.chat.completions.create({
//         model: "feedback-finetuned-model", // Your fine-tuned model trained on feedback examples
//         messages: [
//           {
//             role: "system",
//             content:
//               "You are a highly trained financial analysis assistant. Your job is to refine the provided response according to our global guidelines, ensuring all necessary disclaimers and context are included.",
//           },
//           // Pass the final generated response as input to be refined.
//           { role: "user", content: finalGeneratedMessage.content },
//         ],
//         temperature: 0.6,
//         max_tokens: 500,
//       });
      
//       const refinedMessage = refinedResponse.choices[0].message;
//       console.log("Final refined response:", refinedMessage.content);
      
//       // Return the final, refined response.
//       return NextResponse.json({
//         ...refinedMessage,
//         rawData: functionResponse,
//         functionName: message.function_call.name,
//       });
//     } else {
//       return NextResponse.json({
//         role: "assistant",
//         content:
//           message.content ||
//           "I'm here to help! Could you please clarify your request?",
//       });
//     }
//   } catch (error) {
//     console.error("API Error:", error);
//     return NextResponse.json(
//       {
//         error: "Financial data currently unavailable. Please try again later.",
//         details:
//           process.env.NODE_ENV === "development" ? error.message : undefined,
//       },
//       { status: 500 }
//     );
//   }
// }
