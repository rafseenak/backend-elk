const User = require('../models/userModel');
const Otp = require('../models/otpModel');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const moment = require('moment');
const axios = require('axios');
const path = require('path');
const { PutObjectCommand, S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { validationResult } = require('express-validator');
const { profile } = require('console');
require('dotenv').config();
const AdView = require('../models/adViewModel');
const AdImage = require('../models/adImageModel');
const AdLocation = require('../models/adLocationModel');
const Ad = require('../models/adModel');
const AdPriceDetails = require('../models/adPriceDetailsModel');
const AdWishLists = require('../models/adWishListModel');
const ChatMessage = require('../models/chatMessageModel');
const ChatRoom = require('../models/chatRoomModel');
const ContactView = require('../models/contactViewModel');
const Place = require('../models/placeModel');
const PriceCategory = require('../models/priceCategoryModel');
const SearchCategory = require('../models/searchCategoryModel');
const UserSearch = require('../models/userSearchModel');
const sequelize = require('../config/db');
const crypto = require("crypto");

const generateUserId = () => {
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 1000);
    const userId = `${timestamp}${randomNum}`
    return parseInt(userId);
};

const s3 = new S3Client({
    region: process.env.BUCKET_REGION,
    credentials:{
        accessKeyId: process.env.ACCESS_KEY,
        secretAccessKey: process.env.SECRET_ACCESS_KEY,
    },
});

const sendCurl = async (url) => {
    try {
        const response = await axios.get(url);
        console.log(response.data);
        
        return response.data;
    } catch (error) {
        console.log(error);
        
        return null;
    }
};

async function getImageUrl(imageKey) {
    const command = new GetObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: imageKey,
    });
    const url = `https://${process.env.BUCKET_NAME}.s3.${process.env.BUCKET_REGION}.amazonaws.com/${imageKey}`;
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });
    console.log(signedUrl);
    return signedUrl;
}
const generateRandomString = () => Math.random().toString(36).substring(2, 15);

const sendSangamamOtp = async (mobile, otp) => {
    const username = encodeURIComponent(process.env.SMS_UNAME);
    const password = encodeURIComponent(process.env.SMS_PASSWORD);
    const sender = "SGMOLN";
    const messageContent = `${otp} is your OTP to verify Phone Number . Plz dont share OTP with any one`;
    const message = encodeURIComponent(messageContent);
    const expire = Math.floor(Date.now() / 1000) + 120;
    const timeKey = crypto.createHash("md5").update('send-sms' + "sms@rits-v1.0" + expire).digest("hex");
    const timeAccessTokenKey = crypto.createHash("md5").update(process.env.SMS_ACCESS_TOKEN + timeKey).digest("hex");
    const signature = crypto.createHash("md5").update(timeAccessTokenKey + process.env.SMS_ACCESS_TOKEN_KEY).digest("hex");
    console.log("Signature:", signature);
    // const route = "T";
    const route = 'transactional';
    const authSignature = signature;
    const smsHeader = 'SNGMAM';
    const countryCode = '+91';
    const templateId = '';
    const entityId = '';
    // const url = `https://fastsms.sangamamonline.in/sendsms?uname=${username}&pwd=${password}&senderid=${sender}&to=${mobile}&msg=${message}&route=${route}`;
    const url = `https://fastsms.sangamamonline.in/api/sms/v1.0/send-sms?accessToken=${process.env.SMS_ACCESS_TOKEN}&expire=${expire}&authSignature=${authSignature}&route=${route}&smsHeader=${smsHeader}&messageContent=${message}&recipients=${mobile}&contentType=text&removeDuplicateNumbers=1&countryCode=${countryCode}`;
    return await sendCurl(url);
};

exports.createGuestUser = async (req, res) => {       
    try {
        let userId = generateUserId();
        while (await User.findOne({ where: { user_id: userId } })) {
            userId = generateUserId();
        }
        const guest = await User.create({
            is_guest: true,
            user_id: userId,
            name:'Guest'
        });
        const token = jwt.sign({ id: guest.user_id }, process.env.ACCESS_TOKEN_SECRET);    
        guest.token = token;
        await guest.save();
        const response = {
            user_id: guest.user_id,
            is_guest: guest.is_guest,
            token: guest.token,
            name: guest.name
        };
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.createUser = async (req, res) => {
    const { name, uuid, mobile, email } = req.body;
    if (!mobile && !email) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    if (!name || !uuid) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {
        let user;
        if (email) {
            user = await User.findOne({ where: { email: email } });
            if (user) {
                let profileUrl;
                if (user.profile) {
                    const command = new GetObjectCommand({
                        Bucket: process.env.BUCKET_NAME,
                        Key: user.profile,
                    });
                    profileUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });
                }
                const token = jwt.sign({ id: user.user_id }, process.env.ACCESS_TOKEN_SECRET);
                user.token = token;
                await user.save();

                return res.status(200).json({
                    success: true,
                    message: 'User login success',
                    data: {
                        user_id:user.user_id,
                        name:user.name,
                        token: token,
                        profile: profileUrl,
                        mobile_number: user.mobile_number,
                        email:user.email,
                        is_guest:user.is_guest,
                        description:user.description,
                    }
                });
            } else {
                user = new User({
                    name,
                    user_id: generateUserId(),
                    email,
                    email_uid:uuid,
                });
                await user.save();
                const token = jwt.sign({ id: user.user_id }, process.env.ACCESS_TOKEN_SECRET);
                user.token = token;
                await user.save();

                return res.status(200).json({
                    success: true,
                    message: 'User login success',
                    data: {
                        user_id:user.user_id,
                        name:user.name,
                        token: token,
                        profile: user.profile,
                        mobile_number: user.mobile_number,
                        email:user.email,
                        is_guest:user.is_guest,
                        description:user.description,
                    }
                });
            }
        }
    } catch (error) {
        return res.status(500).json({ message: 'Internal Server error', error });
    }
};

exports.sendOtp = async (req, res) => {
    try {
        const { mobile } = req.body;
        if (!mobile) {
            return res.status(400).json({ message: 'Invalid request' });
        }
        const limits = 50;
        const otpRequestsCount = await Otp.count({
            where: {
                mobile: mobile,
                createdAt: { [Op.gte]: moment().subtract(1, 'day').toDate() }
            }
        });
        if (otpRequestsCount > limits) {
            return res.status(429).json({ message: 'Otp limit reached, please try again later' });
        }
        const otp = Math.floor(100000 + Math.random() * 900000);
        const verificationId = generateRandomString();
        await sendSangamamOtp(mobile.slice(-10), otp);
        await Otp.create({
            mobile: mobile,
            verification_id: verificationId,
            otp: otp
        });
        res.json({ message: 'OTP sent', verificationId: verificationId });
    } catch (error) {
        res.status(500).json({ message: `Internal Server Error. ${error}` });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { verificationId, otp, name } = req.body;
        if (!verificationId || !otp) {
            return res.status(400).json({ message: 'Invalid request' });
        }
        const otpRecord = await Otp.findOne({
            where: { verification_id: verificationId, otp: otp }
        }); 
        if (!otpRecord) {
            return res.status(404).json({ message: 'Invalid OTP' });
        }

        const currentTime = moment();
        const otpTime = moment(otpRecord.createdAt);

        if (currentTime.diff(otpTime, 'minutes') > 10) {
            // await Otp.destroy({ where: { id: otpRecord.id } });
            return res.status(410).json({ message: 'OTP Expired' });
        }
        let user = await User.findOne({ where: { mobile_number: otpRecord.mobile } });
        if (user) {
            const token = jwt.sign({ id: user.user_id }, process.env.ACCESS_TOKEN_SECRET);
            user.set('token', token);
            let profileUrl;
            if (user.profile) {
                const command = new GetObjectCommand({
                    Bucket: process.env.BUCKET_NAME,
                    Key: user.profile,
                });
                profileUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });
            }
            user.profile = profileUrl;
            return res.status(200).json({
                success: true,
                message: 'User login success',
                data: {
                    user_id: user.user_id,
                    name: user.name,
                    mobile_number: user.mobile_number,
                    token: token,
                    profile: user.profile
                }
            });
        } else {
            const newUser = await User.create({
                name: name || 'User',
                user_id: generateUserId(),
                mobile_number: otpRecord.mobile,
            });
            const token = jwt.sign({ id: newUser.user_id }, process.env.ACCESS_TOKEN_SECRET);
            newUser.set('token', token);
            newUser.token = token;
            await newUser.save();
            return res.status(200).json({
                success: true,
                message: 'User registration success',
                data: {
                    user_id: newUser.user_id,
                    name: newUser.name,
                    mobile_number: newUser.mobile_number,
                    token: token,
                    profile: newUser.profile
                }
            });
        }
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.verifyUpdateMobileOtp = async (req, res) => {
    try {
        const { verificationId, otp } = req.body;
        if (!verificationId || !otp) {
            return res.status(400).json({ message: 'Invalid request' });
        }
        const otpRecord = await Otp.findOne({
            where: { verification_id: verificationId, otp: otp }
        });
        if (!otpRecord) {
            return res.status(404).json({ message: 'Invalid OTP' });
        }
        const currentTime = moment();
        const otpTime = moment(otpRecord.createdAt);
        if (currentTime.diff(otpTime, 'minutes') > 10) {
            return res.status(410).json({ message: 'OTP Expired' });
        }
        return res.json({ message: 'Mobile number updated' });
    } catch (error) {
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getUserById = async (req, res) => {
    const id = req.query.id;
    try {
        const user = await User.findOne({ where: { user_id: id } });
        if (!user) {
            return res.status(404).send({ message: 'User not found' });
        }
        let profileUrl;
        if (user.profile) {
            const command = new GetObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: user.profile,
            });
            profileUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });
        }
        user.profile = profileUrl;
        res.status(200).send(user);
    } catch (err) {
        res.status(500).send({ message: 'Error retrieving user'+err });
    }
};

exports.updateProfilePic = async (req, res) => {    
    const id = req.query.id;
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `${id}${fileExtension}`;
    const command = new PutObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
    });
    try{
        await s3.send(command);
        const user = await User.findOne({where:{user_id:id}});
        user.profile=fileName;
        await user.save();
        let profileUrl;
        const command2 = new GetObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: user.profile,
        });
        profileUrl = await getSignedUrl(s3, command2, { expiresIn: 604800 });
        res.status(200).json({success: true, data: profileUrl});
        // res.status(200).json({success: true, data: 'https://rafsi-test.s3.eu-north-1.amazonaws.com/1729532649189110.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAZI2LDFYT5X2HDAMA%2F20241022%2Feu-north-1%2Fs3%2Faws4_request&X-Amz-Date=20241022T172923Z&X-Amz-Expires=604800&X-Amz-Signature=dfbe8be8d82e1cd8bccfdf8e76ee47a5825d521bebe30e3f79929fa6b16e2028&X-Amz-SignedHeaders=host&x-id=GetObject'});
    }catch(e){
        console.error(e)
        res.status(500).json({ success: false, message: e.message });
    }
};

exports.updateEmailOrMobile = async (req, res) => {
    try {
        const { email, mobile, uid, user_id } = req.body;
        if (!email && !mobile) {
            return res.status(400).json({ success: false, message: 'Invalid request' });
        }
        let user = await User.findOne({where:{user_id: user_id}});
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        if (mobile) {
            user.mobile_number = mobile;
            await user.save();
            return res.json({ success: true, message: 'Successfully updated' });
        }
        if (email && uid) {
            user.email = email;
            user.email_uid = uid;
            await user.save();
            return res.json({ success: true, message: 'Successfully updated' });
        }
        return res.status(400).json({ success: false, message: 'Invalid request' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateProfile = async (req, res) => {
    const { name, description, user_id } = req.body;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(202).json({ success: false, message: errors.array()[0].msg });
    }
    try{
        if (!name && !description) {
            return res.status(400).json({ success: false, message: 'Invalid request' });
        }
        let user = await User.findOne({where:{user_id: user_id}});
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        user.name = name;
        user.description = description;
        await user.save();

        return res.status(200).json({ success: true, message: 'Profile successfully updated' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteAccount = async (req, res) => {
    const { user_id } = req.query;

    if (!user_id) {
        return res.status(400).json({ success: false, message: 'Invalid request' });
    }

    try {
        const ads = await Ad.findAll({ where: { user_id: user_id } });
        for (const ad of ads) {
            await AdImage.destroy({ where: { ad_id: ad.ad_id } });
            await AdLocation.destroy({ where: { ad_id: ad.ad_id } });
            await AdPriceDetails.destroy({ where: { ad_id: ad.ad_id } });
            await AdWishLists.destroy({ where: { ad_id: ad.ad_id } });
            await AdView.destroy({ where: { ad_id: ad.ad_id } });
        }
        await Ad.destroy({ where: { user_id } });

        await ChatMessage.destroy({
            where: {
                [Op.or]: [
                    { sender_id: user_id },
                    { reciever_id: user_id },
                ],
            },
        });
        await ChatRoom.destroy({
            where: {
                [Op.or]: [
                    { user1: user_id },
                    { user2: user_id },
                ],
            },
        });
        await ContactView.destroy({
            where: {
                [Op.or]: [
                    { user_id: user_id },
                    { viewer_id: user_id },
                ],
            },
        });
        await UserSearch.destroy({where:{user_id:user_id}});
        const deletedUser = await User.destroy({ where: { user_id: user_id } });
        if (!deletedUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        return res.status(200).json({ success: true, message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Error deleting account:', error);
        return res.status(500).json({ success: false, message: 'An error occurred while deleting the account' });
    }
};

exports.updateNotificationToken = async (req, res) => {
    try {
        const { notification_token } = req.body;
        if (!notification_token) {
            return res.status(400).json({ message: 'Invalid request' });
        }
        const userId = req.user.id;        
        const user = await User.findOne({where: { user_id: userId }});
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        user.notification_token = notification_token;
        await user.save();
        res.json({ message: 'Token updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.userWithAds = async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) {
            return res.status(400).json({ message: 'Invalid request' });
        }
        const user = await User.findOne({
            where:{ user_id },
            include: [
                {
                    model: Ad,
                    as:'ads',
                    include: [
                        {model: AdImage, as: 'ad_images'},
                        {model: AdLocation,as:'ad_location'},
                        {model: AdPriceDetails,as:'ad_price_details'},
                    ]
                },
            ],
            nest: true
        })
        const response={
            id: user.dataValues.id,
            user_id: user.dataValues.user_id,
            is_guest: user.dataValues.is_guest,
            name: user.dataValues.name,
            email_uid: user.dataValues.email_uid,
            profile: user.dataValues.profile?await getImageUrl(user.dataValues.profile):null,
            description: user.dataValues.description,
            notification_token: user.dataValues.notification_token,
            ads: await Promise.all(
                user.dataValues.ads.map(async (ad) => {
                    return{
                        id: ad.dataValues.ad_id,
                        ad_id: ad.dataValues.ad_id,
                        user_id: ad.dataValues.user_id,
                        title: ad.dataValues.title,
                        category: ad.dataValues.category,
                        description: ad.dataValues.description,
                        ad_type: ad.dataValues.ad_type,
                        ad_status: ad.dataValues.ad_status,
                        ad_stage: ad.dataValues.ad_stage,
                        createdAt: ad.dataValues.createdAt.toISOString(),
                        updatedAt: ad.dataValues.updatedAt.toISOString(),
                        ad_price_details: ad.dataValues.ad_price_details.map(priceDetail => ({
                            id: priceDetail.dataValues.id,
                            ad_id: priceDetail.dataValues.ad_id,
                            rent_duration: priceDetail.dataValues.rent_duration,
                            rent_price: priceDetail.dataValues.rent_price,
                            createdAt: priceDetail.dataValues.createdAt.toISOString(),
                            updatedAt: priceDetail.dataValues.updatedAt.toISOString()
                        })),
                        ad_images: await Promise.all(
                            ad.dataValues.ad_images.map(async (image) => {
                            return{
                                id: image.dataValues.id,
                                ad_id: image.dataValues.ad_id,
                                image: image.dataValues.image?await getImageUrl(image.image):null,
                                createdAt: image.dataValues.createdAt.toISOString(),
                                updatedAt: image.dataValues.updatedAt.toISOString()
                            }})),
                        ad_location: {
                            id: ad.dataValues.ad_location.id,
                            ad_id: ad.dataValues.ad_location.ad_id,
                            locality: ad.dataValues.ad_location.locality,
                            place: ad.dataValues.ad_location.place,
                            district: ad.dataValues.ad_location.district,
                            state: ad.dataValues.ad_location.state,
                            country: ad.dataValues.ad_location.country,
                            longitude: `${ad.dataValues.ad_location.longitude}`,
                            latitude: `${ad.dataValues.ad_location.latitude}`,
                            createdAt: ad.dataValues.ad_location.createdAt.toISOString(),
                            updatedAt: ad.dataValues.ad_location.updatedAt.toISOString()
                        },
                    }
                }
            )),
        }
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }console.log(response.ads[0].ad_images);
        
        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({ message: 'Server error' });
    }
};

exports.userWishlists = async (req, res) => {
    try {
        const userId = req.user;
        const wishlist = await AdWishLists.findAll({
            where: { user_id: userId.id },
            attributes: ['ad_id']
        });
        const ads=[];
        const adIds = wishlist.map(w => w.ad_id);
        
        for(i in adIds){
            
            const ad = await Ad.findOne({
                where: { ad_id: adIds[i] },
                include: [
                    {model: User,as:'user'},
                    {model: AdImage,as:'ad_images'},
                    {model: AdLocation,as:'ad_location'},
                    {model: AdPriceDetails,as:'ad_price_details'},
                ],
                nest: true
            });
            const response = {
                id: ad.ad_id,
                ad_id: ad.ad_id,
                user_id: ad.user_id,
                title: ad.title,
                category: ad.category,
                description: ad.description,
                ad_type: ad.ad_type,
                ad_status: ad.ad_status,
                ad_stage: ad.ad_stage,
                createdAt: ad.createdAt.toISOString(),
                updatedAt: ad.updatedAt.toISOString(),
                ad_price_details: ad.ad_price_details.map(priceDetail => ({
                    id: priceDetail.id,
                    ad_id: priceDetail.ad_id,
                    rent_duration: priceDetail.rent_duration,
                    rent_price: priceDetail.rent_price,
                    createdAt: priceDetail.createdAt.toISOString(),
                    updatedAt: priceDetail.updatedAt.toISOString()
                })),
                ad_images: await Promise.all(
                    ad.ad_images.map(async (image) => {
                    return{
                        id: image.id,
                        ad_id: image.ad_id,
                        image: image.image?await getImageUrl(image.image):null,
                        createdAt: image.createdAt.toISOString(),
                        updatedAt: image.updatedAt.toISOString()
                    }})),
                ad_location: {
                    id: ad.ad_location.id,
                    ad_id: ad.ad_location.ad_id,
                    locality: ad.ad_location.locality,
                    place: ad.ad_location.place,
                    district: ad.ad_location.district,
                    state: ad.ad_location.state,
                    country: ad.ad_location.country,
                    longitude: `${ad.ad_location.longitude}`,
                    latitude: `${ad.ad_location.latitude}`,
                    createdAt: ad.ad_location.createdAt.toISOString(),
                    updatedAt: ad.ad_location.updatedAt.toISOString()
                },
                user: {
                    id: ad.user.id,
                    user_id: ad.user.user_id,
                    is_guest: ad.user.is_guest,
                    name: ad.user.name,
                    email: ad.user.email,
                    email_uid: ad.user.email_uid,
                    mobile_number: ad.user.mobile_number,
                    profile: ad.user.profile?await getImageUrl(ad.user.profile):null,
                    description: ad.user.description,
                    notification_token: ad.user.notification_token,
                    token: ad.user.token,
                }
            };
            ads.push(response);
        }
        res.status(200).json(ads);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.removeWishlist = async (req, res) => {
    try {
        const { ad_id } = req.body;
        if (!ad_id) {
            return res.status(400).json({ message: 'Invalid request' });
        }
        const userId = req.user.id;

        const wishlistItem = await AdWishLists.findOne({
            where: {
                user_id: userId,
                ad_id: ad_id
            }
        });
        if (wishlistItem) {
            await wishlistItem.destroy();
            return res.json({ message: 'Wishlist removed' });
        } else {
            return res.json({ message: 'Wishlist already removed' });
        }
    } catch (error) {
        return res.status(500).json({ message: 'Server error' });
    }
};

exports.viewContact = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: 'Invalid request' });
        }
        const viewerId = req.user.id;
        const user = await User.findOne({where:{ user_id: userId }});
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        let profileUrl;
        if (user.profile) {
            const command = new GetObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: user.profile,
            });
            profileUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });
        }
        user.profile = profileUrl;
        user.authUserId = viewerId
        await ContactView.create({
            user_id: userId,
            viewer_id: viewerId   
        });
        const response={
            id:user.id,
            user_id:user.user_id,
            is_guest:user.is_guest,
            name:user.name,
            email:user.email,
            email_uid:user.email_uid,
            mobile_number:user.mobile_number,
            description:user.description,
            notification_token:user.notification_token,
            profile:profileUrl??null,
            authUserId:viewerId
        }
        return res.status(200).json({ message: 'User data fetched', data: response });
    } catch (error) {
        return res.status(500).json({ message: 'Server error' });
    }
};