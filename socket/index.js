[7:16 pm, 19/7/2024] Ajin: import axios from 'axios'
import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout, setOnlineUser, setSocketConnection, setUser } from '../redux/userSlice'
import Sidebar from '../components/Sidebar'
import logo from '../assets/logo.png'
import io from 'socket.io-client'

const Home = () => {
  const user = useSelector(state => state.user)
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()

  console.log('user', user)
  const fetchUserDetails = async () => {
    try {
      const URL = ${process.env.REACT_APP_BACKEND_URL}/api/user-details
      const response = await axios({
        url: UR…
[8:01 pm, 19/7/2024] Ajin: const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const getUserDetailsFromToken = require('../helpers/getUserDetailsFromToken');
const UserModel = require('../models/UserModel');
const { ConversationModel, MessageModel } = require('../models/ConversationModel');
const getConversation = require('../helpers/getConversation');

const app = express();

/***socket connection */
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  }
});

console.log('Server CORS origin:', process.env.FRONTEND_URL); // Log the frontend URL

// Online use…
[8:02 pm, 19/7/2024] Ajin: const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const getUserDetailsFromToken = require('../helpers/getUserDetailsFromToken');
const UserModel = require('../models/UserModel');
const { ConversationModel, MessageModel } = require('../models/ConversationModel');
const getConversation = require('../helpers/getConversation');

const app = express();

/***socket connection */
const server = http.createServer(app);
const io = new Server(server, {

  cors: {
    origin: process.env.FRONTEND_URL,
  //  methods: ["GET", "POST"],
   allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
   
  }
 
});

/*
 * socket running at http://localhost:8080/
 */

// Online user
const onlineUser = new Set();

io.on('connection', async (socket) => {
  console.log("Connected user: ", socket.id);

  const token = socket.handshake.auth.token;
  console.log("Token received: ", token); // Log the token for debugging

  // Current user details
  let user;
  try {
    user = await getUserDetailsFromToken(token);
  } catch (err) {
    console.error("Token verification failed: ", err);
    socket.disconnect();
    return;
  }

  if (!user) {
    console.error("User not found from token");
    socket.disconnect();
    return;
  }

  // Create a room
  socket.join(user._id.toString());
  onlineUser.add(user._id.toString());

  io.emit('onlineUser', Array.from(onlineUser));

  socket.on('message-page', async (userId) => {
    console.log('userId', userId);
    const userDetails = await UserModel.findById(userId).select("-password");

    const payload = {
      _id: userDetails._id,
      name: userDetails.name,
      email: userDetails.email,
      profile_pic: userDetails.profile_pic,
      online: onlineUser.has(userId)
    };
    socket.emit('message-user', payload);

    // Get previous message
    const getConversationMessage = await ConversationModel.findOne({
      "$or": [
        { sender: user._id, receiver: userId },
        { sender: userId, receiver: user._id }
      ]
    }).populate('messages').sort({ updatedAt: -1 });

    socket.emit('message', getConversationMessage?.messages || []);
  });

  // New message
  socket.on('new message', async (data) => {
    // Check conversation is available both user
    let conversation = await ConversationModel.findOne({
      "$or": [
        { sender: data.sender, receiver: data.receiver },
        { sender: data.receiver, receiver: data.sender }
      ]
    });

    // If conversation is not available
    if (!conversation) {
      const createConversation = await ConversationModel({
        sender: data.sender,
        receiver: data.receiver
      });
      conversation = await createConversation.save();
    }

    const message = new MessageModel({
      text: data.text,
      imageUrl: data.imageUrl,
      videoUrl: data.videoUrl,
      msgByUserId: data.msgByUserId,
    });
    const saveMessage = await message.save();

    await ConversationModel.updateOne({ _id: conversation._id }, {
      "$push": { messages: saveMessage._id }
    });

    const getConversationMessage = await ConversationModel.findOne({
      "$or": [
        { sender: data.sender, receiver: data.receiver },
        { sender: data.receiver, receiver: data.sender }
      ]
    }).populate('messages').sort({ updatedAt: -1 });

    io.to(data.sender).emit('message', getConversationMessage?.messages || []);
    io.to(data.receiver).emit('message', getConversationMessage?.messages || []);

    // Send conversation
    const conversationSender = await getConversation(data.sender);
    const conversationReceiver = await getConversation(data.receiver);

    io.to(data.sender).emit('conversation', conversationSender);
    io.to(data.receiver).emit('conversation', conversationReceiver);
  });

  // Sidebar
  socket.on('sidebar', async (currentUserId) => {
    console.log("current user", currentUserId);

    const conversation = await getConversation(currentUserId);

    socket.emit('conversation', conversation);
  });

  socket.on('seen', async (msgByUserId) => {
    let conversation = await ConversationModel.findOne({
      "$or": [
        { sender: user._id, receiver: msgByUserId },
        { sender: msgByUserId, receiver: user._id }
      ]
    });

    const conversationMessageId = conversation?.messages || [];

    await MessageModel.updateMany(
      { _id: { "$in": conversationMessageId }, msgByUserId: msgByUserId },
      { "$set": { seen: true } }
    );

    // Send conversation
    const conversationSender = await getConversation(user._id.toString());
    const conversationReceiver = await getConversation(msgByUserId);

    io.to(user._id.toString()).emit('conversation', conversationSender);
    io.to(msgByUserId).emit('conversation', conversationReceiver);
  });

  // Disconnect
  socket.on('disconnect', () => {
    onlineUser.delete(user._id.toString());
    console.log('Disconnected user: ', socket.id);
  });
});

module.exports = {
  app,
  server
};
