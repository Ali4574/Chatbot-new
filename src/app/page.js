"use client";

import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import {
  Box,
  TextField,
  CircularProgress,
  Typography,
  IconButton,
  Grid,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Tooltip,
} from "@mui/material";
import {
  Send as SendIcon,
  ThumbUpAltOutlined,
  ThumbDownAltOutlined,
  FlagOutlined,
  Check,
  ContentCopy,
} from "@mui/icons-material";
import ThumbUpAlt from "@mui/icons-material/ThumbUpAlt";
import ThumbDownAlt from "@mui/icons-material/ThumbDownAlt";
import Flag from "@mui/icons-material/Flag";
import ReactMarkdown from "react-markdown";
import { styled, keyframes } from "@mui/material/styles";
import { Chart } from "react-chartjs-2";
import {
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  BarElement,
  LineController,
  BarController,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend,
  Chart as ChartJS,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";

// Register chart.js components.
ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  LineController,
  BarController,
  BarElement,
  ChartTitle,
  ChartTooltip,
  Legend,
  annotationPlugin
);

// ----------------------------------------------------------------
// Helper: calculateSMA
// Computes a simple moving average using a window size (15 days).
// ----------------------------------------------------------------
const calculateSMA = (data, windowSize) => {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < windowSize) {
      const avg =
        data.slice(0, i + 1).reduce((acc, val) => acc + val, 0) / (i + 1);
      sma.push(avg);
    } else {
      const windowSlice = data.slice(i - windowSize + 1, i + 1);
      const sum = windowSlice.reduce((acc, val) => acc + val, 0);
      sma.push(sum / windowSize);
    }
  }
  return sma;
};

// ----------------------------------------------------------------
// Animation & Styled Components
// ----------------------------------------------------------------
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

// OuterContainer wraps the entire page.
const OuterContainer = styled(Box)(({ theme }) => ({
  maxWidth: "800px",
  margin: "0 auto",
  padding: theme.spacing(2),
  minHeight: "100vh",
  backgroundColor: "transparent",
  color: "#fff",
  position: "relative",
}));

// Header: fixed at the top with a set height.
const Header = styled(Box)(({ theme }) => ({
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  height: "100px", // Fixed height for header
  backgroundColor: "#0a0a0a",
  zIndex: 1000,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  padding: theme.spacing(1),
}));

// InputArea: fixed at the bottom with a set height.
const InputArea = styled(Box)(({ theme }) => ({
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  height: "80px", // Fixed height for input area
  backgroundColor: "#0a0a0a",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  padding: theme.spacing(1),
}));

// MessageArea: scrollable area that fills the space between header and input.
// The top and bottom margins match the header and input heights.
const MessageArea = styled(Box)(({ theme }) => ({
  marginTop: "80px",
  marginBottom: "80px",
  overflowY: "auto",
}));

// ChatContainer for messages and charts.
const ChatContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  backgroundColor: "transparent",
  color: "#fff",
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(2),
}));

const QuestionBox = styled(Box)(({ theme }) => ({
  alignSelf: "flex-end",
  background: "linear-gradient(45deg, #2196f3 30%, #21cbf3 90%)",
  color: "#fff",
  borderRadius: "20px 20px 20px 0",
  padding: theme.spacing(1.5),
  marginBottom: theme.spacing(1),
  display: "inline-block",
  animation: `${fadeIn} 0.5s ease-out`,
}));

const AnswerText = styled(Box)(({ theme }) => ({
  alignSelf: "flex-start",
  padding: theme.spacing(1.5),
  marginBottom: theme.spacing(2),
  maxWidth: "100%",
  lineHeight: 1.8,
  animation: `${fadeIn} 0.5s ease-out`,
  "& a": {
    color: "#2196f3 !important",
    textDecoration: "underline",
    fontWeight: 500,
    transition: "all 0.2s ease-in-out",
    "&:hover": {
      color: "#1976d2 !important",
      textDecoration: "none !important",
    },
  },
}));

const ChartContainerWrapper = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2),
  marginBottom: theme.spacing(2),
}));

// ----------------------------------------------------------------
// Chart Components
// ----------------------------------------------------------------

// PriceChartDisplay: Renders the price chart.
// Its x-axis is hidden so that the common date labels appear only in the volume chart.
const PriceChartDisplay = ({ chartData, chartTitle, chartType }) => {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top", labels: { color: "#fff" } },
      title: {
        display: true,
        text: chartTitle,
        color: "#fff",
        font: { size: 16 },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || "";
            const value = context.parsed.y;
            return `${label}: ${value}`;
          },
        },
      },
      zoom: {
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
        pan: { enabled: true, mode: "x" },
      },
    },
    scales: {
      x: {
        display: false, // Hide x-axis; dates will be shown in the volume chart.
        ticks: { color: "#fff" },
        grid: { color: "rgba(255,255,255,0.2)" },
      },
      y: {
        // Use logarithmic scale when in bar chart mode.
        type: chartType === "bar" ? "logarithmic" : "linear",
        ticks: {
          color: "#fff",
          callback: function (value) {
            if (chartType === "bar") {
              return Number(value).toLocaleString();
            }
            return value;
          },
        },
        grid: { color: "rgba(255,255,255,0.2)" },
        title: { display: true, text: "Price (INR)", color: "#fff" },
      },
    },
  };

  return <Chart data={chartData} options={options} type={chartType} />;
};

// VolumeChartDisplay: Renders the volume chart as a bar chart.
// The volume chart displays the common date labels and includes zoom and pan.
const VolumeChartDisplay = ({ chartData }) => {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top", labels: { color: "#fff" } },
      title: {
        display: true,
        text: "Volume",
        color: "#fff",
        font: { size: 16 },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || "";
            const value = context.parsed.y;
            return `${label}: ${value}`;
          },
        },
      },
      zoom: {
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
        pan: { enabled: true, mode: "x" },
      },
    },
    scales: {
      x: {
        display: true,
        ticks: { color: "#fff" },
        grid: { color: "rgba(255,255,255,0.2)" },
        title: { display: true, text: "Time", color: "#fff" },
      },
      y: {
        ticks: { color: "#fff" },
        grid: { color: "rgba(255,255,255,0.2)" },
        title: { display: true, text: "Volume", color: "#fff" },
      },
    },
  };

  return <Chart data={chartData} options={options} type="bar" />;
};

// ----------------------------------------------------------------
// Markdown Components (for rendering chat messages)
// ----------------------------------------------------------------
const markdownComponents = {
  p: ({ node, ...props }) => <p style={{ textAlign: "justify", textIndent: "1em" }} {...props} />,
  h1: ({ node, ...props }) => (
    <h1 style={{ margin: "1.2em 0 0.5em", paddingBottom: "0.3em", fontWeight: "bold", textAlign: "justify" }} {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 style={{ margin: "1.2em 0 0.5em", paddingBottom: "0.3em", fontWeight: "bold", textAlign: "justify" }} {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 style={{ margin: "1em 0 0.5em", fontWeight: "bold", textAlign: "justify" }} {...props} />
  ),
  li: ({ node, ...props }) => <li style={{ marginBottom: "0.5em", marginLeft: "1em", textAlign: "justify" }} {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote
      style={{ borderLeft: "4px solid #4bd8d8", margin: "1em 0", paddingLeft: "1em", fontStyle: "italic", color: "#ccc", textAlign: "justify" }}
      {...props}
    />
  ),
  a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
};

// ----------------------------------------------------------------
// FeedbackButtons (unchanged)
// ----------------------------------------------------------------
const UpdatedIconWrapper = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== "active",
})(({ theme, active }) => ({
  color: active ? theme.palette.primary.contrastText : "#fff",
  backgroundColor: active ? theme.palette.primary.main : "transparent",
  "&:hover": {
    backgroundColor: active ? theme.palette.primary.dark : "rgba(255,255,255,0.1)",
  },
}));

const FeedbackButtons = ({ messageId, content }) => {
  const [feedback, setFeedback] = useState(null);
  const [reportText, setReportText] = useState("");
  const [showReportPopup, setShowReportPopup] = useState(false);
  const [copied, setCopied] = useState(false);

  const sendFeedback = async (action, reportMsg = "") => {
    try {
      await axios.put("/api/feedback", { messageId, action, reportMessage: reportMsg });
      setFeedback(action);
    } catch (error) {
      console.error("Error updating feedback:", error);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
      <Tooltip title={copied ? "Copied!" : "Copy"}>
        <UpdatedIconWrapper onClick={handleCopy} size="small">
          {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
        </UpdatedIconWrapper>
      </Tooltip>
      <Tooltip title="Like">
        <UpdatedIconWrapper
          onClick={() => sendFeedback("like")}
          size="small"
          active={feedback === "like"}
          sx={{ display: feedback === "dislike" || feedback === "report" ? "none" : "inline-flex" }}
        >
          {feedback === "like" ? <ThumbUpAlt fontSize="small" /> : <ThumbUpAltOutlined fontSize="small" />}
        </UpdatedIconWrapper>
      </Tooltip>
      <Tooltip title="Dislike">
        <UpdatedIconWrapper
          onClick={() => sendFeedback("dislike")}
          size="small"
          active={feedback === "dislike"}
          sx={{ display: feedback === "like" || feedback === "report" ? "none" : "inline-flex" }}
        >
          {feedback === "dislike" ? <ThumbDownAlt fontSize="small" /> : <ThumbDownAltOutlined fontSize="small" />}
        </UpdatedIconWrapper>
      </Tooltip>
      <Tooltip title="Report">
        <UpdatedIconWrapper
          onClick={() => setShowReportPopup(true)}
          size="small"
          active={feedback === "report"}
          sx={{ display: feedback === "like" ? "none" : "inline-flex" }}
        >
          {feedback === "report" ? <Flag fontSize="small" /> : <FlagOutlined fontSize="small" />}
        </UpdatedIconWrapper>
      </Tooltip>
      {showReportPopup && (
        <Box
          sx={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "#1e1e1e",
            p: 3,
            zIndex: 1000,
            borderRadius: 2,
            boxShadow: "0px 4px 20px rgba(0,0,0,0.5)",
            width: "90%",
            maxWidth: "500px",
            border: "1px solid #2196f3",
          }}
        >
          <Typography variant="subtitle1" sx={{ mb: 2, color: "#fff" }}>
            Report Issue
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder="Please describe the issue you encountered..."
            sx={{
              "& .MuiInputBase-root": {
                color: "#fff",
                backgroundColor: "rgba(255,255,255,0.1)",
                borderRadius: 1,
                "&:hover fieldset": { borderColor: "#2196f3" },
                "&.Mui-focused fieldset": { borderColor: "#2196f3" },
              },
            }}
          />
          <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button
              variant="outlined"
              onClick={() => setShowReportPopup(false)}
              sx={{ color: "#fff", borderColor: "#444", "&:hover": { borderColor: "#2196f3" } }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                sendFeedback("report", reportText);
                setShowReportPopup(false);
              }}
              sx={{ background: "linear-gradient(45deg, #2196f3 30%, #21cbf3 90%)", "&:hover": { opacity: 0.9 } }}
            >
              Submit
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
};

// ----------------------------------------------------------------
// Chat Component
// ----------------------------------------------------------------
export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Allow toggling between "line" and "bar" chart types for the price chart.
  const [chartType, setChartType] = useState("line");
  const messagesEndRef = useRef(null);

  // Dynamically import and register the zoom plugin (client side only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      import("chartjs-plugin-zoom").then((module) => {
        ChartJS.register(module.default);
      });
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    if (messages.length > 0) {
      axios
        .post("/api/chatlog", {
          userId: "static-user-123",
          messages: messages,
        })
        .catch((error) => {
          console.error("Error updating chat log:", error);
        });
    }
  }, [messages]);

  // ----------------------------------------------------------------
  // sendMessage: processes user input, posts to API, and builds chart data.
  // ----------------------------------------------------------------
  const sendMessage = async (messageContent) => {
    if (!messageContent.trim() || loading) return;
    setLoading(true);
    const userMessage = { messageId: uuidv4(), role: "user", content: messageContent };
    setMessages((prev) => [...prev, userMessage]);
    try {
      const { data } = await axios.post("/api/chat", { messages: [...messages, userMessage] });
      const assistantMessage = { ...data, messageId: data.messageId || uuidv4() };

      // Process rawData for chart display if available.
      if (assistantMessage.rawData && assistantMessage.rawData.length > 0) {
        if (assistantMessage.rawData[0].history && assistantMessage.rawData[0].history.length > 0) {
          // Use the same date labels for both charts.
          const labels = assistantMessage.rawData[0].history.map((item) =>
            new Date(item.date).toLocaleDateString()
          );
          const priceDatasets = [];
          const volumeDatasets = [];
          const numSymbols = assistantMessage.rawData.length;
          assistantMessage.rawData.forEach((asset, index) => {
            const priceData = asset.history.map((item) => item.price);
            // Derive a professional color for this stock.
            const priceColor = `hsl(${(index * 360) / numSymbols}, 50%, 60%)`;
            if (numSymbols <= 2) {
              // Include SMA if there are 2 or fewer stocks.
              priceDatasets.push({
                label: asset.symbol || asset.name || `Asset ${index + 1}`,
                data: priceData,
                fill: false,
                borderColor: priceColor,
                backgroundColor: priceColor,
                tension: 0.1,
              });
              const sma15 = calculateSMA(priceData, 15);
              priceDatasets.push({
                label: `${asset.symbol || asset.name} 15-Day SMA`,
                data: sma15,
                fill: false,
                borderColor: "darkgrey",
                borderDash: [2, 2],
                tension: 0.1,
              });
            } else {
              priceDatasets.push({
                label: asset.symbol || asset.name || `Asset ${index + 1}`,
                data: priceData,
                fill: false,
                borderColor: priceColor,
                backgroundColor: priceColor,
                tension: 0.1,
              });
            }
            // Build volume dataset if available.
            if (asset.history[0].volume !== undefined) {
              const volumeData = asset.history.map((item) => item.volume);
              volumeDatasets.push({
                label: `${asset.symbol || asset.name} Volume`,
                data: volumeData,
                backgroundColor: `hsla(${(index * 360) / numSymbols}, 50%, 60%, 0.3)`,
                borderColor: priceColor,
                borderWidth: 1,
                barPercentage: 0.6,
                categoryPercentage: 0.8,
                order: 0,
              });
            }
          });
          assistantMessage.chartDataPrice = { labels, datasets: priceDatasets };
          if (volumeDatasets.length > 0) {
            assistantMessage.chartDataVolume = { labels, datasets: volumeDatasets };
          }
          assistantMessage.chartTitle =
            assistantMessage.rawData.map((item) => item.symbol).join(" & ") +
            " Price History";
        }
      }
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Client-side error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I encountered an error. Please try again or ask about financial topics.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const messageToSend = input;
    setInput("");
    await sendMessage(messageToSend);
  };

  const handleExampleClick = (example) => {
    sendMessage(example);
  };

  const handleChartType = (event, newType) => {
    if (newType !== null) {
      setChartType(newType);
    }
  };

  return (
    <OuterContainer>
      {/* Fixed Header */}
      <Header>
        <Typography variant="h5" sx={{ mb: 2, fontWeight: 300, textAlign: "center" }}>
          PROFIT FLOW
        </Typography>
        {messages.length === 0 && (
          <Box sx={{ mb: 1, display: "flex", gap: 2, justifyContent: "center" }}>
            {["top 2 stocks", "price of infosys stock"].map((question, idx) => (
              <Button
                key={idx}
                variant="contained"
                onClick={() => handleExampleClick(question)}
                sx={{
                  borderRadius: "20px",
                  background: "linear-gradient(45deg, #2196f3 30%, #21cbf3 90%)",
                  color: "#fff",
                  textTransform: "none",
                  fontWeight: 600,
                  boxShadow: "0px 3px 5px -1px rgba(0,0,0,0.2)",
                  "&:hover": {
                    background: "linear-gradient(45deg, #21cbf3 30%, #2196f3 90%)",
                  },
                }}
              >
                {question}
              </Button>
            ))}
          </Box>
        )}
      </Header>

      {/* Scrollable Message Area */}
      <MessageArea>
        <ChatContainer>
          <Box
            sx={{
              flex: 1,
              overflowY: "auto",
              pb: 1,
              scrollbarWidth: "none",
              "&::-webkit-scrollbar": { display: "none" },
            }}
          >
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <QuestionBox key={i}>
                  <ReactMarkdown components={markdownComponents}>
                    {msg.content}
                  </ReactMarkdown>
                </QuestionBox>
              ) : (
                <AnswerText key={i}>
                  <ReactMarkdown components={markdownComponents}>
                    {msg.content || "Fetching real-time data..."}
                  </ReactMarkdown>
                  {msg.chartDataPrice && (
                    <ChartContainerWrapper>
                      <Box sx={{ width: "100%", height: "300px" }}>
                        <ToggleButtonGroup
                          value={chartType}
                          exclusive
                          onChange={handleChartType}
                          size="small"
                          sx={{
                            mb: 1,
                            "& .MuiToggleButton-root": {
                              color: "#fff",
                              borderColor: "#444",
                              backgroundColor: "transparent",
                            },
                            "& .Mui-selected": {
                              backgroundColor: "#444 !important",
                              color: "#fff",
                            },
                          }}
                        >
                          <ToggleButton value="line">Line</ToggleButton>
                          <ToggleButton value="bar">Bar</ToggleButton>
                        </ToggleButtonGroup>
                        <PriceChartDisplay
                          chartData={msg.chartDataPrice}
                          chartTitle={msg.chartTitle}
                          chartType={chartType}
                        />
                      </Box>
                      {msg.chartDataVolume && (
                        <Box sx={{ width: "100%", height: "250px", mt: 7 }}>
                          <VolumeChartDisplay chartData={msg.chartDataVolume} />
                        </Box>
                      )}
                    </ChartContainerWrapper>
                  )}
                  <FeedbackButtons messageId={msg.messageId} content={msg.content} />
                </AnswerText>
              )
            )}
            {loading && (
              <AnswerText>
                <Grid container spacing={1} alignItems="center">
                  <Grid item>
                    <CircularProgress size={20} sx={{ color: "#fff" }} />
                  </Grid>
                </Grid>
              </AnswerText>
            )}
            <div ref={messagesEndRef} />
          </Box>
        </ChatContainer>
      </MessageArea>

      {/* Fixed Input Area */}
      <InputArea>
        {/* Wrap the form inside a container to restrict width */}
        <Box sx={{ maxWidth: "800px", mx: "auto", width: "100%" }}>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", gap: 1 }}>
            <TextField
              fullWidth
              variant="outlined"
              size="small"
              multiline
              maxRows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for stock/crypto price"
              sx={{
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "#1e1e1e",
                  borderRadius: "8px",
                  border: "1px solid #2196f3",
                  "& fieldset": { borderColor: "#2196f3" },
                  "&:hover fieldset": { borderColor: "#fff" },
                  "&.Mui-focused fieldset": { borderColor: "#fff" },
                },
                "& .MuiInputBase-input::placeholder": {
                  color: "grey",
                  opacity: 1,
                },
              }}
              InputProps={{
                sx: { color: "#fff" }, // This directly sets the input text color to white
                endAdornment: (
                  <IconButton type="submit" color="primary" disabled={loading}>
                    <SendIcon />
                  </IconButton>
                ),
              }}
            />
          </Box>
        </Box>
      </InputArea>
    </OuterContainer>
  );
}
