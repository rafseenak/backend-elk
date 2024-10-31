const ChatRoom = require('../models/chatRoomModel');
const ChatMessage = require('../models/chatMessageModel');
const { PutObjectCommand, S3Client, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
require('dotenv').config();
const { Op,literal } = require('sequelize');
const BlockedUser = require('../models/blockedUserModel');
const sequelize = require('../config/db');
const User = require('../models/userModel');

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

async function getImageUrl(imageKey) {
    const command = new GetObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: imageKey,
    });
    const url = `https://${process.env.BUCKET_NAME}.s3.${process.env.BUCKET_REGION}.amazonaws.com/${imageKey}`;
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });
    return signedUrl;
}

exports.addChat = async (req, res) => {
    const { authUserId, userId, message, type, file_name,ad_id,ad_name,status }= req.body;
    const file = req.file;    
    if ( !authUserId || !userId || !message || !type|| !status ) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {       
        const isBlocked = await BlockedUser.findOne({
            where: { blocker_id: userId, blocked_id: authUserId }
        });
        let chatRoom = await ChatRoom.findOne({
            where: {
                [Op.or]: [
                    { user1: authUserId, user2: userId },
                    { user1: userId, user2: authUserId },
                ],
            },
        });
        const lastMessageTime = Date.now();
        if (!chatRoom) {
            chatRoom = await ChatRoom.create({
                room_id: generateRoomId(),
                user1: authUserId,
                user2: userId,
                last_message_time: lastMessageTime
            });
        }else{
            chatRoom.last_message_time = lastMessageTime;
            await chatRoom.save();
        }
        if (file) {
            const command = new PutObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: file_name,
                Body: file.buffer,
                ContentType: file.mimetype,
            });
            await s3.send(command);
        }
        const chatMessage = await ChatMessage.create({
            room_id: chatRoom.room_id,
            sender_id: authUserId,
            reciever_id: userId,
            message: message,
            type: type,
            status: isBlocked ? 'blocked' : status,
            file_name: file ? file_name : '',
            ad_id,
            ad_name,
            time: lastMessageTime,
        });
        chatMessage.dataValues.file_url=(file_name!=='')?await getImageUrl(file_name):null;
        res.status(200).json({ message: 'Chat message added successfully', data: chatMessage.dataValues });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Something went wrong'+error });
    }
};

exports.blockAUser = async (req,res) => {
    const { authUserId, otherUserId } = req.body;
    if ( !authUserId && !otherUserId ) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try{
        await BlockedUser.create({ blocker_id: authUserId, blocked_id: otherUserId });
        return res.status(200).json({ message: 'Success!' });
    }catch(e){
        return res.status(500).json({ message: 'Something went wrong' });
    }
};

exports.unblockAUser = async (req, res) => {
    const { authUserId, otherUserId } = req.body;
    if ( !authUserId && !otherUserId ) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {
        const result = await BlockedUser.destroy({
            where: { blocker_id: authUserId, blocked_id: otherUserId }
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
    const { blockerId, blockedId } = req.query;
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

exports.updateMessageStatus = async (authUserId, otherUserId)=>{
    try{
        let chatRoom = await ChatRoom.findOne({
            where: {
                [Op.or]: [
                    { user1: authUserId, user2: otherUserId },
                    { user1: otherUserId, user2: authUserId },
                ],
            },
        });
        if (!chatRoom) {
            return;
        }
        const chats=await ChatMessage.update(
            { status: 'read' },
            {
                where: {
                    room_id: chatRoom.room_id,
                    sender_id: otherUserId,
                    status: { [Op.eq]: 'send' }
                }
            }
        );
        return { authUserId, otherUserId }
    }catch(e){
        console.log(e);     
    }
}

exports.getChatMessages = async (req, res) => {
    const { authUserId, otherUserId } = req.query;
    console.log('getchats called.');
    
    if (!authUserId || !otherUserId) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {
        const isBlockedByOther = await BlockedUser.findOne({
            where: { blocker_id: otherUserId, blocked_id: authUserId }
        });
        const isYouBlockedOther = await BlockedUser.findOne({
            where: { blocker_id: authUserId, blocked_id: otherUserId }
        });
        let chatRoom = await ChatRoom.findOne({
            where: {
                [Op.or]: [
                    { user1: authUserId, user2: otherUserId },
                    { user1: otherUserId, user2: authUserId },
                ],
            },
        });
        let data;
        if (!chatRoom) {
            data={
                chatMessages:[],
                chatRoom:{}
            }
            return res.status(200).json({ message: 'Chat room not found', data });
        }
       
        const chatMessages = await ChatMessage.findAll({
            where: {
                room_id: chatRoom.room_id,
                [Op.or]: [
                    {
                        reciever_id: {
                            [Op.ne]: authUserId
                        }
                    },
                    {
                        status: {
                            [Op.ne]: 'blocked'
                        }
                    }
                ]
            },
            order: [['time', 'ASC']],
        });
        const cleanMessages = chatMessages.map(message => message.dataValues);
        const cleanChatRoom = chatRoom.dataValues;
        await Promise.all(cleanMessages.map(async (message) => {
            message.file_url = (message.file_name!=='')?await getImageUrl(message.file_name):null;
        }));
        data={
            chatMessages:cleanMessages,
            chatRoom:cleanChatRoom
        }        
        res.status(200).json({ message: 'Chat messages retrieved successfully', data });
    } catch (error) {
        res.status(500).json({ error: 'Something went wrongokk: ' + error.message });
    }
};

exports.getTotalChatRoomsCount = async (req, res)=>{
    const { authUserId } = req.query
    try{
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
        res.status(200).json({ message: 'Chat messages retrieved successfully', count });
    }catch(e){
        res.status(500).json({ error: 'Something went wrong: ' + e.message });
    }
}

exports.getChatRooms = async (req, res)=>{
    const { authUserId } = req.query
    try{
        const chatRooms = await ChatRoom.findAll({
            where: {
                [Op.or]: [
                    { user1: authUserId??1730134624019338 },
                    { user2: authUserId??1730134624019338 }
                ]
            },
            attributes: {
                include: [
                    [sequelize.fn('COUNT', sequelize.literal(`CASE WHEN chat_messages.reciever_id = ${authUserId??1730134624019338} and chat_messages.status = 'send' THEN 1 END`)), 'new_message_count']
                ]
            },
            include: [
                { model: User, as: 'User1' },
                { model: User, as: 'User2' },
                { model: ChatMessage, as: 'chat_messages', attributes: [], required: false }
            ],
            group: ['ChatRoom.id'],
            order: [['last_message_time', 'ASC']],
        });
        let data = []
        if(chatRooms.length>0){
            data = await Promise.all(
                chatRooms.map(async (chatRoom) => {                
                    chatRoom.User1.profile =chatRoom.User1.profile!=null? await getImageUrl(chatRoom.User1.profile):null;
                    chatRoom.User2.profile =chatRoom.User2.profile!=null? await getImageUrl(chatRoom.User2.profile):null;
                    return chatRoom;
                })
            );
        }
        res.status(200).json({ message: 'Chat messages retrieved successfully', data });
    }catch(e){
        res.status(500).json({ error: 'Something went wrong: ' + e.message });
    }
}







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

