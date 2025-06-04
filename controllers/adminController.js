const { Op } = require('sequelize');
const Ad = require('../models/adModel');
const AdLocation = require('../models/adLocationModel');
const AdImage = require('../models/adImageModel');
const AdPriceDetails = require('../models/adPriceDetailsModel');
const User = require('../models/userModel');
const { PutObjectCommand, S3Client, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const AdViews = require('../models/adViewModel');
const AdWishLists = require('../models/adWishListModel');

require('dotenv').config();

const s3 = new S3Client({
    region: process.env.BUCKET_REGION,
    credentials: {
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

async function deleteImageFromS3(imageKey) {
    try {
        const command = new DeleteObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: imageKey,
        });

        await s3.send(command);
        return true;
    } catch (error) {
        console.error(`Error deleting image ${imageKey}:`, error);
        return false;
    }
}

const getAdminAds = async (req, res) => {
    try {
        const { date, location } = req.query;
        let whereClause = {};
        let locationClause = {};

        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            whereClause.createdAt = { [Op.between]: [startDate, endDate] };
        }

        if (location) {
            locationClause = {
                [Op.or]: [
                    { locality: { [Op.like]: `%${location}%` } },
                    { place: { [Op.like]: `%${location}%` } },
                    { district: { [Op.like]: `%${location}%` } },
                    { state: { [Op.like]: `%${location}%` } },
                    { country: { [Op.like]: `%${location}%` } }
                ]
            };
        }

        const ads = await Ad.findAll({
            where: whereClause,
            include: [
                { model: User, as: 'user', attributes: ['id', 'name', 'email', 'mobile_number'] },
                { model: AdImage, as: 'ad_images', attributes: ['image'] },
                { model: AdPriceDetails, as: 'ad_price_details', attributes: ['rent_price', 'rent_duration'] },
                { model: AdLocation, as: 'ad_location', where: location ? locationClause : undefined, required: !!location }
            ],
            order: [['createdAt', 'DESC']]
        });
        const adsWithUrls = await Promise.all(ads.map(async (ad) => {
            const adObj = ad.toJSON(); // Convert to plain object
            if (adObj.ad_images) {
                adObj.ad_images = await Promise.all(adObj.ad_images.map(async (img) => ({
                    ...img,
                    image: await getImageUrl(img.image), // Replace image key with S3 URL
                })));
            }
            return adObj;
        }));
        return res.status(200).json({ success: true, ads: adsWithUrls });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const getAllUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            // where: {
            //     is_guest : false
            // }
        });
        const usersWithProfileUrls = await Promise.all(users.map(async (user) => {
            const userObj = user.toJSON();
            if (userObj.profile) {
                userObj.profile = await getImageUrl(userObj.profile);
            }
            return userObj;
        }));
        return res.status(200).json({ success: true, users: usersWithProfileUrls });
    } catch (error) {
        console.error('Error fetching users:', error);
        return res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const blockUserById = async (req, res) => {
    try {
        const { id } = req.query;
        const user = await User.findOne({
            where: {
                user_id : id
            }
        });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.block_status = !user.block_status;
        await user.save();

        return res.status(200).json({ success: true, message: 'User blocked successfully' });
    } catch (error) {
        console.error('Error blocking user:', error);
        return res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const deleteAdminAd = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({ success: false, message: "Ad ID is required" });
        }
        const ad = await Ad.findOne({ad_id:id}, {
            include: [{ model: AdImage, as: 'ad_images' }]
        });
        if (!ad) {
            return res.status(404).json({ success: false, message: "Ad not found" });
        }
        if (ad.ad_images && ad.ad_images.length > 0) {
            await Promise.all(ad.ad_images.map(async (img) => {
                await deleteImageFromS3(img.image);
            }));
        }
        await AdImage.destroy({ where: { ad_id: id } });
        await AdLocation.destroy({where: { ad_id: id } });
        await AdPriceDetails.destroy({where: { ad_id: id } });
        await AdViews.destroy({where: { ad_id: id } });
        await AdWishLists.destroy({where: { ad_id: id } });
        await Ad.destroy({ where: { ad_id: id } });
        return res.status(200).json({ success: true, message: "Ad deleted successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

const getAllAdLocations = async (req, res) => {
    try {
        const adLocations = await AdLocation.findAll();
        const uniquePlaces = Array.from(
            new Set(
                adLocations
                    .flatMap(adLoc => [adLoc.dataValues.locality, adLoc.dataValues.place, adLoc.dataValues.district, adLoc.dataValues.state, adLoc.dataValues.country])
                    .filter(Boolean)
            )
        );       
        return res.status(200).json({ success: true, adLocations, list: uniquePlaces });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};


module.exports = { getAdminAds, deleteAdminAd, getAllAdLocations, getAllUsers, blockUserById };
