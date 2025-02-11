//src\app\api\feedback\route.js

import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import UserChatLog from '@/src/models/UserChatLog';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

// Connect to MongoDB if not already connected.
if (!mongoose.connection.readyState) {
  mongoose
    .connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch((err) => console.error('MongoDB connection error:', err));
}

export async function PUT(request) {
  try {
    // Default userId to 'static-user-123' if not provided.
    const { userId = 'static-user-123', messageId, action, reportMessage } = await request.json();
    console.log("Received feedback update:", { userId, messageId, action, reportMessage });

    // Validate that the action is allowed.
    if (!['like', 'dislike', 'report'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Build the update object based on the action.
    const update = {};
    if (action === 'like') {
      update["messages.$.actions.like"] = true;
      update["messages.$.actions.dislike"] = false;
    } else if (action === 'dislike') {
      update["messages.$.actions.dislike"] = true;
      update["messages.$.actions.like"] = false;
    } else if (action === 'report') {
      update["messages.$.actions.report"] = true;
      update["messages.$.actions.reportMessage"] = reportMessage || "";
    }

    // Use the positional operator "$" to update the matching message in the messages array.
    const result = await UserChatLog.updateOne(
      { userId, "messages.messageId": messageId },
      { $set: update }
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json({ error: 'Message not found or feedback not updated' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Feedback updated successfully', messageId });
  } catch (error) {
    console.error('Feedback API error:', error);
    return NextResponse.json(
      { error: 'Failed to update feedback', details: error.message },
      { status: 500 }
    );
  }
}
