//src\app\api\chatlog\route.js

import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import UserChatLog from '@/src/models/UserChatLog';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

// Connect to MongoDB (ensure that you are not reconnecting on every request)
if (!mongoose.connection.readyState) {
  mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
}

export async function POST(request) {
  try {
    const { userId, messages } = await request.json();

    // Update or create document with the given userId
    await UserChatLog.findOneAndUpdate(
      { userId },
      { $push: { messages: { $each: messages } } },
      { upsert: true, new: true }
    );

    return NextResponse.json({ message: 'Chat log updated successfully' });
  } catch (error) {
    console.error('Error saving chat log:', error);
    return NextResponse.json(
      { error: 'Failed to save chat log', details: error.message },
      { status: 500 }
    );
  }
}
