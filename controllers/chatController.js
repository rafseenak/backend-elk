const ChatRoom = require('../models/chatRoomModel');
const ChatMessage = require('../models/chatMessageModel');
const { PutObjectCommand, S3Client, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
require('dotenv').config();

const s3 = new S3Client({
    region: process.env.BUCKET_REGION,
    credentials:{
        accessKeyId: process.env.ACCESS_KEY,
        secretAccessKey: process.env.SECRET_ACCESS_KEY,
    },
});

function generateRoomId() {
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 1000);
    const userId = `${timestamp}${randomNum}`
    return parseInt(userId);
}

exports.addChat = async (req, res) => {
    const { senderId, receiverId, message, type, file_url }= req.body;
    const file = req.file;
    if ( !senderId || !receiverId || !message || !type ) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {
        let chatRoom = await ChatRoom.findOne({
            where: {
                [sequelize.Op.or]: [
                    { user1: senderId, user2: receiverId },
                    { user1: receiverId, user2: senderId },
                ],
            },
        });
        if (!chatRoom) {
            chatRoom = await ChatRoom.create({
                room_id: generateRoomId(),
                user1: senderId,
                user2: receiverId,
            });
        }
        let fileName;
        if (file) {
            fileName = `${Date.now()}_${file.originalname}`;
            const command = new PutObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: fileName,
                Body: file.buffer,
                ContentType: file.mimetype,
            });
            await s3.send(command);
            adImages.push({
                ad_id: ad_id,
                image: fileName,
            });
        }
        const chatMessage = await ChatMessage.create({
            room_id: chatRoom.room_id,
            sender_id: senderId,
            reciever_id: receiverId,
            message: message,
            type: type,
            status: 'send',
            file_name: fileName?fileName:null,
            file_url: file_url?file_url:null
        });
        res.status(200).json({ message: 'Chat message added successfully', data: chatMessage });
    } catch (error) {
        res.status(500).json({ error: 'Something went wrong' });
    }
};

exports.getRoomChat = async (req, res) => {
    const { room_id } = req.body;
    if ( !room_id ) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {
        const chatRoom = await ChatRoom.findOne({ 
            where: { room_id: room_id },
            include: [
                { model: Participant, as: 'participants' },
                { model: ChatMessage, as: 'chat_messages' },
            ],
            order: [['createdAt', 'ASC']],
            nest: true
        });
        if(!chatRoom){
            return res.status(400).json({ message: 'No Room' });
        }
        return res.status(200).json({ message: 'Success!' });
    } catch (error) {
        return res.status(500).json({ error: 'Something went wrong' });
    }
};

exports.deleteRoom = async (req,res)=>{
    const { id }=req.body;
    if ( !id ) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try{
      const chatRoom = await ChatRoom.findOne({ where: { room_id:id } });
      if(!chatRoom){
        return res.status(200).json({ message: 'Already deleted!' });
      }
      await ChatMessage.destroy({ where: { room_id: id}  });
      await Participant.destroy({ where: { room_id: id}  });
      await ChatRoom.destroy({ where: { room_id: id } });
      return res.status(200).json({ message: 'Successfully Deleted!' });
    }catch(error){
      return res.status(500).json({ error: 'Something went wrong'+error });
    }
};

exports.deleteMessage = async (req,res)=>{
    const { id }=req.body;
    if ( !id ) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try{
        const message = await ChatMessage.findOne({ where: { id: id}  });
        if(!message){
            return res.status(400).json({ message: 'Already deleted!' });
        }
        await ChatMessage.destroy({ where: { id: id}  });
        return res.status(200).json({ message: 'Successfully Deleted!' });
    }catch(error){
        return res.status(500).json({ error: 'Something went wrong'+error });
    }
};