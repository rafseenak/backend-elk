const express = require('express');
const bodyParser = require('body-parser');
const userRoutes = require('./routes/userRoutes');
const sequelize = require('./config/db');
require('dotenv').config();
const cors = require('cors');
const app = express();
const chatController = require('./controllers/chatController');
const socketIo = require('socket.io');
const http = require('http');
const ChatRoom = require('./models/chatRoomModel');
const ChatMessage = require('./models/chatMessageModel');
const { Op,literal } = require('sequelize');
const User = require('./models/userModel');
const { PutObjectCommand, S3Client, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const server = http.createServer(app);
const io = socketIo(server, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

const port = process.env.PORT || 3000;
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use('/api', userRoutes);

const s3 = new S3Client({
  region: process.env.BUCKET_REGION,
  credentials:{
      accessKeyId: process.env.ACCESS_KEY,
      secretAccessKey: process.env.SECRET_ACCESS_KEY,
  },
});

async function getImageUrl(imageKey) {
  const command = new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: imageKey,
  });
  const url = `https://${process.env.BUCKET_NAME}.s3.${process.env.BUCKET_REGION}.amazonaws.com/${imageKey}`;
  const signedUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });
  return signedUrl;
}
app.get('/', (req, res) => {
  res.send('Welcome to the Node.js MySQL API');
}); 

sequelize.sync({ alter: false })
  .then(() => {
    console.log('Database synced successfully!');
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  }) 
  .catch(err => {
    console.error('Error syncing database:', err);
  });

io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('sendMessage', async (messageData) => {
    try {
      if (messageData.file) {        
        const fileBuffer = Buffer.from(messageData.file, 'base64');
        const fileMimeType = messageData.fileType;
        await chatController.addChat(
          {
            body: {
              authUserId: messageData.authUserId,
              userId: messageData.userId,
              message: messageData.message,
              type: messageData.type,
              file_name:messageData.file_name,
              ad_id:messageData.ad_id,
              ad_name:messageData.ad_name,
              status: messageData.status
            },
            file: {
              buffer: fileBuffer,
              originalname: 'filename.ext',
              mimetype: fileMimeType,
            },
          },
          { 
            status: (code) => ({ 
              json: (result) => {
                console.log(code);
                if(code==200){
                  io.emit('newMessage', result['data']);
                }
              } 
            }) 
          }
        );
      } else {
        await chatController.addChat(
          {
            body: {
              authUserId: messageData.authUserId,
              userId: messageData.userId,
              message: messageData.message,
              type: messageData.type,
              file_name: '',
              ad_id:messageData.ad_id,
              ad_name:messageData.ad_name,
              status: messageData.status
            }
          }, 
          {
            status: (code) => ({ 
              json: (result) => {
                console.log(code);
                if(code==200){
                  io.emit('newMessage', result['data']);
                }
              } 
            }) 
          }
        );
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  socket.on('updateMessageStatus', async ({ authUserId, otherUserId }) => {
    try {
      await chatController.updateMessageStatus(authUserId, otherUserId);
    } catch (error) {
      console.error('Error updating message status:', error);
    }
  });

  socket.on('getChatRooms',async (authUserId)=>{
    const chatRooms = await ChatRoom.findAll({
      where: {
          [Op.or]: [
              { user1: authUserId },
              { user2: authUserId }
          ]
      },
      attributes: {
          include: [
              [sequelize.fn('COUNT', sequelize.literal(`CASE WHEN chat_messages.reciever_id = ${authUserId} and chat_messages.status = 'send' THEN 1 END`)), 'new_message_count']
          ]
      },
      include: [
          { model: User, as: 'User1' },
          { model: User, as: 'User2' },
          { model: ChatMessage, as: 'chat_messages', attributes: [], required: false }
      ],
      group: ['ChatRoom.id'],
      order: [['last_message_time', 'DESC']],
    });
    let data1 = []
    if (chatRooms.length > 0) {
      data1 = await Promise.all(
        chatRooms.map(async (chatRoom) => {
        const localTime = new Date(chatRoom.last_message_time).toLocaleString("en-US", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "numeric",
            minute: "numeric",
            hour12: true
        });
        chatRoom.last_message_time === localTime;
        const authUser = chatRoom.User1.id === authUserId ? chatRoom.User1.toJSON() : chatRoom.User2.toJSON();
        const otherUser = chatRoom.User1.id === authUserId ? chatRoom.User2.toJSON() : chatRoom.User1.toJSON();
        authUser.profile = authUser.profile ? await getImageUrl(authUser.profile) : null;
        otherUser.profile = otherUser.profile ? await getImageUrl(otherUser.profile) : null;
        return {
            ...chatRoom.toJSON(),
            last_message_time: localTime,
            User1: null,
            User2 : null,
            authUser,
            otherUser,
        };
      }));
    }
    socket.emit('chatRooms',data1);
  });

  socket.on("requestChatRoomCount", async (authUserId) => {
    const count = await ChatRoom.count({
        where: {
            [Op.or]: [
                { user1: authUserId },
                { user2: authUserId }
            ]
        },
        include: [{
          model: ChatMessage,
          as: 'chat_messages',
          where: { status: 'send',reciever_id: authUserId },
        }],
    });
    socket.emit("chatRoomCount", count);
  });

  socket.on('disconnect', () => {
      console.log('A user disconnected');
  });
});