//src\models\UserChatLog.js

import mongoose from 'mongoose';

const UserChatLogSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  messages: { type: Array, default: [] },
}, { timestamps: true });

export default mongoose.models.UserChatLog || mongoose.model('UserChatLog', UserChatLogSchema);
