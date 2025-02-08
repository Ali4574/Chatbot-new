"use client";
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
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
} from '@mui/material';
import {
  Send as SendIcon,
  ThumbUpAltOutlined,
  ThumbDownAltOutlined,
  FlagOutlined,
  Check,
  ContentCopy,
} from '@mui/icons-material';
// Import filled variants:
import ThumbUpAlt from '@mui/icons-material/ThumbUpAlt';
import ThumbDownAlt from '@mui/icons-material/ThumbDownAlt';
import Flag from '@mui/icons-material/Flag';

import ReactMarkdown from 'react-markdown';
import { styled, keyframes } from '@mui/material/styles';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ChartTitle,
  ChartTooltip,
  Legend
);

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

const ChatContainer = styled(Box)(({ theme }) => ({
  height: '80vh',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'transparent',
  color: '#fff',
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(2),
  overflow: 'hidden',
}));

const QuestionBox = styled(Box)(({ theme }) => ({
  alignSelf: 'flex-end',
  background: 'linear-gradient(45deg, #2196f3 30%, #21cbf3 90%)',
  color: '#fff',
  borderRadius: '20px 20px 20px 0',
  padding: theme.spacing(1.5),
  marginBottom: theme.spacing(1),
  display: 'inline-block',
  animation: `${fadeIn} 0.5s ease-out`,
}));

const AnswerText = styled(Box)(({ theme }) => ({
  alignSelf: 'flex-start',
  padding: theme.spacing(1.5),
  marginBottom: theme.spacing(2),
  maxWidth: '100%',
  lineHeight: 1.8,
  animation: `${fadeIn} 0.5s ease-out`,
  '& a': {
    color: '#2196f3 !important',
    textDecoration: 'underline',
    fontWeight: 500,
    transition: 'all 0.2s ease-in-out',
    '&:hover': {
      color: '#1976d2 !important',
      textDecoration: 'none !important',
    },
  },
}));

const ChartContainerWrapper = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2),
  marginBottom: theme.spacing(2),
}));

const ChartDisplay = ({ chartData, chartType, chartTitle }) => {
  const adjustedData = JSON.parse(JSON.stringify(chartData));
  if (chartType === 'bar') {
    adjustedData.datasets.forEach((dataset) => {
      delete dataset.tension;
      dataset.fill = true;
    });
  }
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#fff' },
      },
      title: {
        display: true,
        text: chartTitle,
        color: '#fff',
        font: { size: 16 },
      },
    },
    scales: {
      x: {
        ticks: { color: '#fff' },
        grid: { color: 'rgba(255,255,255,0.2)' },
        title: {
          display: true,
          text:
            (chartData.labels &&
              chartData.labels[0] &&
              (chartData.labels[0].includes('-') || chartData.labels[0].includes('/')))
              ? 'Time'
              : 'Symbol',
          color: '#fff',
        },
      },
      y: {
        ticks: { color: '#fff' },
        grid: { color: 'rgba(255,255,255,0.2)' },
        title: { display: true, text: 'Price (USD)', color: '#fff' },
      },
    },
  };

  return chartType === 'line' ? (
    <Line data={chartData} options={commonOptions} />
  ) : (
    <Bar data={adjustedData} options={commonOptions} />
  );
};

const markdownComponents = {
  p: ({ node, ...props }) => (
    <p style={{ textAlign: 'justify', textIndent: '1em' }} {...props} />
  ),
  h1: ({ node, ...props }) => (
    <h1
      style={{
        margin: '1.2em 0 0.5em',
        paddingBottom: '0.3em',
        fontWeight: 'bold',
        textAlign: 'justify',
      }}
      {...props}
    />
  ),
  h2: ({ node, ...props }) => (
    <h2
      style={{
        margin: '1.2em 0 0.5em',
        paddingBottom: '0.3em',
        fontWeight: 'bold',
        textAlign: 'justify',
      }}
      {...props}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3 style={{ margin: '1em 0 0.5em', fontWeight: 'bold', textAlign: 'justify' }} {...props} />
  ),
  li: ({ node, ordered, ...props }) => (
    <li style={{ marginBottom: '0.5em', marginLeft: '1em', textAlign: 'justify' }} {...props} />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote
      style={{
        borderLeft: '4px solid #4bd8d8',
        margin: '1em 0',
        paddingLeft: '1em',
        fontStyle: 'italic',
        color: '#ccc',
        textAlign: 'justify',
      }}
      {...props}
    />
  ),
  a: ({ node, ...props }) => (
    <a target="_blank" rel="noopener noreferrer" {...props} />
  ),
};

// -------------------- Updated IconWrapper --------------------
// This wrapper forces white icons by default and applies filled background styling.
const UpdatedIconWrapper = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== 'active',
})(({ theme, active }) => ({
  color: active ? theme.palette.primary.contrastText : '#fff',
  backgroundColor: active ? theme.palette.primary.main : 'transparent',
  '&:hover': {
    backgroundColor: active ? theme.palette.primary.dark : 'rgba(255,255,255,0.1)',
  },
}));

// -------------------- FeedbackButtons Component --------------------
const FeedbackButtons = ({ messageId, content }) => {
  const [feedback, setFeedback] = useState(null);
  const [reportText, setReportText] = useState('');
  const [showReportPopup, setShowReportPopup] = useState(false);
  const [copied, setCopied] = useState(false);

  const sendFeedback = async (action, reportMsg = '') => {
    try {
      await axios.put('/api/feedback', {
        messageId,
        action,
        reportMessage: reportMsg,
      });
      setFeedback(action);
    } catch (error) {
      console.error('Error updating feedback:', error);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {/* Copy Button */}
      <Tooltip title={copied ? "Copied!" : "Copy"}>
        <UpdatedIconWrapper onClick={handleCopy} size="small">
          {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
        </UpdatedIconWrapper>
      </Tooltip>

      {/* Like Button */}
      <Tooltip title="Like">
        <UpdatedIconWrapper
          onClick={() => sendFeedback('like')}
          size="small"
          active={feedback === 'like'}
          sx={{ display: (feedback === 'dislike' || feedback === 'report') ? 'none' : 'inline-flex' }}
        >
          {feedback === 'like' ? (
            <ThumbUpAlt fontSize="small" />
          ) : (
            <ThumbUpAltOutlined fontSize="small" />
          )}
        </UpdatedIconWrapper>
      </Tooltip>

      {/* Dislike Button */}
      <Tooltip title="Dislike">
        <UpdatedIconWrapper
          onClick={() => sendFeedback('dislike')}
          size="small"
          active={feedback === 'dislike'}
          sx={{ display: (feedback === 'like' || feedback === 'report') ? 'none' : 'inline-flex' }}
        >
          {feedback === 'dislike' ? (
            <ThumbDownAlt fontSize="small" />
          ) : (
            <ThumbDownAltOutlined fontSize="small" />
          )}
        </UpdatedIconWrapper>
      </Tooltip>

      {/* Report Button */}
      <Tooltip title="Report">
        <UpdatedIconWrapper
          onClick={() => setShowReportPopup(true)}
          size="small"
          active={feedback === 'report'}
          sx={{ display: feedback === 'like' ? 'none' : 'inline-flex' }}
        >
          {feedback === 'report' ? (
            <Flag fontSize="small" />
          ) : (
            <FlagOutlined fontSize="small" />
          )}
        </UpdatedIconWrapper>
      </Tooltip>

      {/* Report Dialog */}
      {showReportPopup && (
        <Box
          sx={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#1e1e1e',
            p: 3,
            zIndex: 1000,
            borderRadius: 2,
            boxShadow: '0px 4px 20px rgba(0,0,0,0.5)',
            width: '90%',
            maxWidth: '500px',
            border: '1px solid #2196f3',
          }}
        >
          <Typography variant="subtitle1" sx={{ mb: 2, color: '#fff' }}>
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
              '& .MuiInputBase-root': {
                color: '#fff',
                backgroundColor: 'rgba(255,255,255,0.1)',
                borderRadius: 1,
                '&:hover fieldset': { borderColor: '#2196f3' },
                '&.Mui-focused fieldset': { borderColor: '#2196f3' },
              },
            }}
          />
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button
              variant="outlined"
              onClick={() => setShowReportPopup(false)}
              sx={{
                color: '#fff',
                borderColor: '#444',
                '&:hover': { borderColor: '#2196f3' },
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                sendFeedback('report', reportText);
                setShowReportPopup(false);
              }}
              sx={{
                background: 'linear-gradient(45deg, #2196f3 30%, #21cbf3 90%)',
                '&:hover': { opacity: 0.9 },
              }}
            >
              Submit
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
};

// -------------------- End FeedbackButtons --------------------

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chartType, setChartType] = useState('line');
  const messagesEndRef = useRef(null);

  const defaultQuestions = ['top 2 stocks', 'price of infosys stock'];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    console.log(messages);
    if (messages.length > 0) {
      axios.post('/api/chatlog', {
        userId: 'static-user-123',
        messages: messages,
      }).catch(error => {
        console.error('Error updating chat log:', error);
      });
    }
  }, [messages]);

  const sendMessage = async (messageContent) => {
    if (!messageContent.trim() || loading) return;
    setLoading(true);

    // Generate a unique messageId for the user message.
    const userMessage = { messageId: uuidv4(), role: 'user', content: messageContent };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const { data } = await axios.post('/api/chat', {
        messages: [...messages, userMessage],
      });
      // Ensure the assistant message includes a messageId.
      const assistantMessage = { ...data, messageId: data.messageId || uuidv4() };

      // Process rawData for chartData if available.
      if (assistantMessage.rawData && assistantMessage.rawData.length > 0) {
        let chartData;
        let chartTitle = '';

        if (assistantMessage.rawData[0].history && assistantMessage.rawData[0].history.length > 0) {
          const labels = assistantMessage.rawData[0].history.map((item) =>
            new Date(item.date).toLocaleDateString()
          );
          const datasets = assistantMessage.rawData.map((asset, index) => ({
            label: asset.symbol || asset.name || `Asset ${index + 1}`,
            data: asset.history.map((item) => item.price),
            fill: false,
            borderColor: `hsl(${(index * 360) / assistantMessage.rawData.length}, 70%, 50%)`,
            backgroundColor: `hsl(${(index * 360) / assistantMessage.rawData.length}, 70%, 50%)`,
            tension: 0.1,
          }));
          chartData = { labels, datasets };
          chartTitle = `${assistantMessage.rawData.map((item) => item.symbol).join(' & ')} Price History`;
        } else if (assistantMessage.rawData[0].dates && assistantMessage.rawData[0].prices) {
          if (assistantMessage.rawData[0].prices.length > 1) {
            chartData = {
              labels: assistantMessage.rawData[0].dates,
              datasets: assistantMessage.rawData.map((item, index) => ({
                label: item.symbol || 'Price',
                data: item.prices,
                fill: false,
                borderColor: `hsl(${(index * 360) / assistantMessage.rawData.length}, 70%, 50%)`,
                backgroundColor: `hsl(${(index * 360) / assistantMessage.rawData.length}, 70%, 50%)`,
                tension: 0.1,
              })),
            };
            chartTitle = `${assistantMessage.rawData.map((item) => item.symbol).join(' & ')} Price History`;
          } else {
            chartData = {
              labels: assistantMessage.rawData.map((item, index) => item.symbol || `Asset ${index + 1}`),
              datasets: [
                {
                  label: 'Current Price',
                  data: assistantMessage.rawData.map((item) => item.prices[0]),
                  backgroundColor: assistantMessage.rawData.map(
                    (_, index) => `hsl(${(index * 360) / assistantMessage.rawData.length}, 70%, 50%)`
                  ),
                  borderColor: assistantMessage.rawData.map(
                    (_, index) => `hsl(${(index * 360) / assistantMessage.rawData.length}, 70%, 50%)`
                  ),
                  borderWidth: 1,
                },
              ],
            };
            chartTitle = `${assistantMessage.rawData.map((item) => item.symbol).join(' & ')} Current Price`;
          }
        }
        assistantMessage.chartData = chartData;
        assistantMessage.chartTitle = chartTitle;
      }

      // Append the assistant message (now with messageId) to messages.
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Client-side error:", error);
      setMessages((prev) => [
        ...prev,
        { role: '⚠️', content: "I encountered an error. Please try again or ask about financial topics." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const messageToSend = input;
    setInput('');
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
    <Box
      sx={{
        maxWidth: '800px',
        mx: 'auto',
        p: 2,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'transparent',
        color: '#fff',
      }}
    >
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 300, textAlign: 'center' }}>
        PROFIT FLOW
      </Typography>

      {messages.length === 0 && (
        <Box sx={{ mb: 2, display: 'flex', gap: 2, justifyContent: 'center' }}>
          {defaultQuestions.map((question, idx) => (
            <Button
              key={idx}
              variant="contained"
              onClick={() => handleExampleClick(question)}
              sx={{
                borderRadius: '20px',
                background: 'linear-gradient(45deg, #2196f3 30%, #21cbf3 90%)',
                color: '#fff',
                textTransform: 'none',
                fontWeight: 600,
                boxShadow: '0px 3px 5px -1px rgba(0,0,0,0.2)',
                '&:hover': {
                  background: 'linear-gradient(45deg, #21cbf3 30%, #2196f3 90%)',
                },
              }}
            >
              {question}
            </Button>
          ))}
        </Box>
      )}

      <ChatContainer>
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            pb: 1,
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {messages.map((msg, i) =>
            msg.role === 'user' ? (
              <QuestionBox key={i}>
                <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
              </QuestionBox>
            ) : (
              <AnswerText key={i}>
                <ReactMarkdown components={markdownComponents}>
                  {msg.content || 'Fetching real-time data...'}
                </ReactMarkdown>
                {msg.chartData && (
                  <ChartContainerWrapper>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                      <ToggleButtonGroup
                        value={chartType}
                        exclusive
                        onChange={handleChartType}
                        size="small"
                        sx={{
                          '& .MuiToggleButton-root': {
                            color: '#fff',
                            borderColor: '#444',
                            backgroundColor: 'transparent',
                          },
                          '& .Mui-selected': {
                            backgroundColor: '#444 !important',
                            color: '#fff',
                          },
                        }}
                      >
                        <ToggleButton value="line">Line</ToggleButton>
                        <ToggleButton value="bar">Bar</ToggleButton>
                      </ToggleButtonGroup>
                    </Box>
                    <Box sx={{ width: '100%', height: '400px' }}>
                      <ChartDisplay
                        chartData={msg.chartData}
                        chartType={chartType}
                        chartTitle={msg.chartTitle}
                      />
                    </Box>
                  </ChartContainerWrapper>
                )}
                {/* Render feedback buttons using the messageId */}
                <FeedbackButtons messageId={msg.messageId} content={msg.content} />
              </AnswerText>
            )
          )}
          {loading && (
            <AnswerText>
              <Grid container spacing={1} alignItems="center">
                <Grid item>
                  <CircularProgress size={20} sx={{ color: '#fff' }} />
                </Grid>
              </Grid>
            </AnswerText>
          )}
          <div ref={messagesEndRef} />
        </Box>

        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            mt: 2,
            display: 'flex',
            gap: 1,
          }}
        >
          <TextField
            fullWidth
            variant="outlined"
            size="small"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask for stock/crypto price"
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#1e1e1e',
                borderRadius: '8px',
                border: '1px solid #2196f3',
                '& fieldset': { borderColor: '#2196f3' },
                '&:hover fieldset': { borderColor: '#fff' },
                '&.Mui-focused fieldset': { borderColor: '#fff' },
              },
              input: { color: '#fff' },
            }}
            InputProps={{
              endAdornment: (
                <IconButton type="submit" color="primary" disabled={loading}>
                  <SendIcon />
                </IconButton>
              ),
            }}
          />
        </Box>
      </ChatContainer>
    </Box>
  );
}