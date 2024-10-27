const ChatRoom = require('../models/chatRoomModel');
const ChatMessage = require('../models/chatMessageModel');
const { PutObjectCommand, S3Client, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
require('dotenv').config();
const { Op,literal } = require('sequelize');
const BlockedUser = require('../models/blockedUserModel');

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
        const isBlocked = await BlockedUser.findOne({
            where: { blocker_id: receiverId, blocked_id: senderId }
        });
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
        const deletedFor = isBlocked ? [receiverId] : [];
        const chatMessage = await ChatMessage.create({
            room_id: chatRoom.room_id,
            sender_id: senderId,
            reciever_id: receiverId,
            message: message,
            type: type,
            status: 'send',
            file_name: fileName?fileName:null,
            file_url: file_url?file_url:null,
            deleted_for: deletedFor,
        });
        res.status(200).json({ message: 'Chat message added successfully', data: chatMessage });
    } catch (error) {
        res.status(500).json({ error: 'Something went wrong' });
    }
};

exports.blockAUser = async (req,res) => {
    const { blockerId, blockedId } = req.body;
    if ( !blockerId && !blockedId ) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try{
        await BlockedUser.create({ blocker_id: blockerId, blocked_id: blockedId });
        return res.status(200).json({ message: 'Success!' });
    }catch(e){
        return res.status(500).json({ message: 'Something went wrong' });
    }
};

exports.unblockAUser = async (req, res) => {
    const { blockerId, blockedId } = req.body;
    if (!blockerId || !blockedId) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {
        const result = await BlockedUser.destroy({
            where: { blocker_id: blockerId, blocked_id: blockedId }
        });
        if (result === 0) {
            return res.status(404).json({ message: 'No block record found' });
        }  
        return res.status(200).json({ message: 'User unblocked successfully!' });
    } catch (e) {
        return res.status(500).json({ message: 'Something went wrong' });
    }
};

exports.isUserBlocked = async (req, res) => {
    const { blockerId, blockedId } = req.body;
    if (!blockerId || !blockedId) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    
    try {
        const isBlocked = await BlockedUser.findOne({
            where: { blocker_id: blockerId, blocked_id: blockedId }
        });
        
        if (isBlocked) {
            return res.status(200).json({ message: 'User is blocked', blocked: true });
        } else {
            return res.status(200).json({ message: 'User is not blocked', blocked: false });
        }
    } catch (e) {
        return res.status(500).json({ message: 'Something went wrong' });
    }
};

exports.getChatMessages = async (req, res) => {
    const { authUserId, otherUserId } = req.query;
    if (!authUserId || !otherUserId) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {
        let chatRoom = await ChatRoom.findOne({
            where: {
                [Op.or]: [
                    { user1: authUserId, user2: otherUserId },
                    { user1: otherUserId, user2: authUserId },
                ],
            },
        });
        if (!chatRoom) {
            const data={}
            return res.status(200).json({ message: 'Chat room not found', data });
        }
        const chatMessages = await ChatMessage.findAll({
            where: {
                room_id: chatRoom.room_id,
                [Op.not]: sequelize.where(sequelize.fn('array_contains', sequelize.col('deleted_for')), authUserId)
            },
            order: [['createdAt', 'ASC']],
        });
        const data={
            chatMessages,
            chatRoom
        }
        res.status(200).json({ message: 'Chat messages retrieved successfully', data });
    } catch (error) {
        res.status(500).json({ error: 'Something went wrong: ' + error.message });
    }
};

exports.deleteOneChatMessageForUser = async (req, res) => {
    const { authUserId, messageId } = req.body;
    if (!authUserId || !messageId) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {
        const chatMessage = await ChatMessage.findByPk(messageId);
        if (!chatMessage) {
            return res.status(404).json({ message: 'Chat message not found' });
        }
        if (!chatMessage.deleted_for.includes(authUserId)) {
            chatMessage.deleted_for.push(authUserId);
            await chatMessage.save();
        }
        res.status(200).json({ message: 'Chat message deleted for user successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Something went wrong: ' + error.message });
    }
};

exports.deleteAllMessagesForUser = async (req, res) => {
    const { authUserId, otherUserId } = req.body;
    if (!authUserId || !otherUserId) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {
        const chatRoom = await ChatRoom.findOne({
            where: {
                [Op.or]: [
                    { user1: authUserId, user2: otherUserId },
                    { user1: otherUserId, user2: authUserId },
                ],
            },
        });
        if (!chatRoom) {
            return res.status(404).json({ message: 'Chat room not found' });
        }
        const chatMessages = await ChatMessage.findAll({
            where: {
                room_id: chatRoom.room_id,
            },
        });
        for (const message of chatMessages) {
            if (!message.deleted_for.includes(authUserId)) {
                message.deleted_for.push(authUserId);
                await message.save();
            }
        }
        res.status(200).json({ message: 'All chat messages deleted for user successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Something went wrong: ' + error.message });
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