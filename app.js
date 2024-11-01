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
const server = http.createServer(app);
const io = socketIo(server);

const port = process.env.PORT || 5000;
server.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use('/api', userRoutes);

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
    console.log('called');
  
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
    console.log('updateMessageStatus called');
    try {
      await chatController.updateMessageStatus(authUserId, otherUserId);
    } catch (error) {
      console.error('Error updating message status:', error);
    }
  });

  socket.on('disconnect', () => {
      console.log('A user disconnected');
  });
});