const User = require('../models/userModel');
const { Op, literal } = require('sequelize');
const { PutObjectCommand, S3Client, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const AdWishLists = require('../models/adWishListModel');
const AdImage = require('../models/adImageModel');
const AdPriceDetails = require('../models/adPriceDetailsModel');
const AdLocation = require('../models/adLocationModel');
const Ad = require('../models/adModel');
const AdView = require('../models/adViewModel');
const SearchCategory = require('../models/searchCategoryModel');
const sequelize = require('../config/db');
const UserSearch = require('../models/userSearchModel');

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

function generateAdId() {
    const timestamp = Date.now();
    const randomNum = Math.floor(Math.random() * 1000);
    const userId = `${timestamp}${randomNum}`
    return parseInt(userId);
}

exports.createAd = async (req, res) => {
    const data = req.body;
    if (!data.title || !data.description || !data.ad_type || !data.category || !data.ad_prices) {
        return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    try {
        const user = req.user;
        const { ad_id, title, description, category, ad_type, ad_prices } = req.body;
        await SearchCategory.create({
            keyword: title,
            category: category,
            ad_type: ad_type
        })
        const adStage = req.body.ad_stage || 1;
        const adStatus = req.body.ad_status || 'offline';
        if (!ad_id) {
            const ad = await Ad.create({
                ad_id: generateAdId(),
                user_id: user.id,
                title,
                description,
                category,
                ad_type,
                ad_stage: adStage,
                ad_status: adStatus
            });
            const adPrices = Object.entries(ad_prices).map(([key, value]) => ({
                ad_id: ad.ad_id,
                rent_duration: key,
                rent_price: value
            }));
            await AdPriceDetails.bulkCreate(adPrices);
            return res.status(200).json({ success: true, message: 'Ad created successfully', ad_id: ad.ad_id });
        }
        else {
            const ad = await Ad.findOne({ where: { ad_id } });
            if (!ad) {
                return res.status(404).json({ success: false, message: 'Ad not found' });
            }
            await AdPriceDetails.destroy({ where: { ad_id: ad.ad_id } });
            ad.title = title;
            ad.description = description;
            ad.category = category;
            ad.ad_type = ad_type;
            ad.ad_stage = adStage;
            ad.ad_status = adStatus;
            await ad.save();
            const adPrices = Object.entries(ad_prices).map(([key, value]) => ({
                ad_id: ad.ad_id,
                rent_duration: key,
                rent_price: value
            }));
            await AdPriceDetails.bulkCreate(adPrices);
            return res.status(200).json({ success: true, message: 'Ad updated successfully', ad_id: ad.ad_id });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
}

exports.updateAdImage = async (req, res) => {
    const { ad_id, ad_stage, ad_status } = req.query;
    const images = req.files;

    if (!ad_id) {
        return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    try {
        const adImages = [];
        if (images || images.length !== 0) {
            for (const image of images) {
                const fileName = `${ad_id}_${image.originalname}`;
                const command = new PutObjectCommand({
                    Bucket: process.env.BUCKET_NAME,
                    Key: fileName,
                    Body: image.buffer,
                    ContentType: image.mimetype,
                });
                await s3.send(command);
                adImages.push({
                    ad_id: ad_id,
                    image: fileName,
                });
            }
            const ad = await Ad.findOne({ where: { ad_id: ad_id } });
            if (!ad) {
                return res.status(404).json({ success: false, message: 'Ad not found' });
            }
            ad.ad_status = ad_status || 'offline';
            ad.ad_stage = ad_stage || 2;
            await ad.save();
            await AdImage.bulkCreate(adImages);
        }
        const updatedImages = await AdImage.findAll({ where: { ad_id } });
        for (const image of updatedImages) {
            const command = new GetObjectCommand({
                Bucket: process.env.BUCKET_NAME,
                Key: image.image,
            });
            imageUrl = await getSignedUrl(s3, command, { expiresIn: 604800 });
            image.image = imageUrl;
        }
        return res.status(200).json({
            success: true,
            message: 'Image upload success',
            data: updatedImages
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
}

exports.deletAdImage = async (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {
        const data = await AdImage.findOne({ where: { id } });
        if (!data) {
            return res.status(404).json({ success: false, message: 'Image not found' });
        }
        const deleteCommand = new DeleteObjectCommand({
            Bucket: process.env.BUCKET_NAME,
            Key: data.image,
        });
        await s3.send(deleteCommand);
        await AdImage.destroy({ where: { id } });
        return res.status(200).json({ success: true, message: 'Successfully deleted' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Delete error' });
    }
}

exports.updateAdAddress = async (req, res) => {
    const { ad_id, country, latitude, longitude, state, district, locality, ad_stage, ad_status, place } = req.body;
    if (!ad_id || !country || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    try {
        let adLocation = await AdLocation.findOne({ where: { ad_id } });
        if (adLocation) {
            adLocation.country = country;
            adLocation.state = state;
            adLocation.district = district;
            adLocation.locality = locality;
            adLocation.place = place;
            adLocation.longitude = longitude;
            adLocation.latitude = latitude;
            await adLocation.save();
        } else {
            adLocation = new AdLocation({
                ad_id,
                country,
                state,
                district,
                locality,
                place,
                longitude,
                latitude
            });
            await adLocation.save();
        }
        const ad = await Ad.findOne({ where: { ad_id } });
        ad.ad_status = ad_status || 'online';
        ad.ad_stage = ad_stage || 3;
        await ad.save();
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }
        return res.status(200).json({ success: true, message: 'Location updated successfully' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Update error' });
    }
}

exports.deleteAd = async (req, res) => {
    const { adId } = req.body;
    if (!adId) {
        return res.status(400).json({ message: 'Invalid request' });
    }
    try {
        const adRows = await Ad.findOne({ where: { ad_id: adId } });
        if (!adRows) {
            return res.status(404).json({ message: 'Already deleted' });
        }
        await AdImage.destroy({ where: { ad_id: adId } });
        await AdLocation.destroy({ where: { ad_id: adId } });
        await AdPriceDetails.destroy({ where: { ad_id: adId } });
        await AdView.destroy({ where: { ad_id: adId } });
        await AdWishLists.destroy({ where: { ad_id: adId } });
        await Ad.destroy({ where: { ad_id: adId } });
        return res.status(200).json({ message: 'Ad deleted' });
    } catch (error) {
        return res.status(500).json({ message: 'Server error' });
    }
}

exports.getAdDetails = async (req, res) => {
    try {
        const userId = req.body.user_id;
        let wishLists
        let wishListAdIds
        if(userId){
            wishLists = await AdWishLists.findAll({ where: { user_id: userId } });
            wishListAdIds = wishLists.map(item => item.ad_id);
        }
        if (!req.body.ad_id) {
            return res.status(400).json({ message: 'Invalid request' });
        }
        const ad = await Ad.findOne({
            where: { ad_id: req.body.ad_id },
            include: [
                { model: User, as: 'user' },
                { model: AdImage, as: 'ad_images' },
                { model: AdLocation, as: 'ad_location' },
                { model: AdPriceDetails, as: 'ad_price_details' },
            ],
            nest: true
        });
        if (!ad) {
            return res.status(404).json({ message: 'Ad not found' });
        }
        ad.user = ad.user.toJSON();
        ad.user.token = undefined;
        ad.user.createdAt = undefined;
        ad.user.updatedAt = undefined;
        ad.wishListed = userId?wishListAdIds.includes(ad.ad_id):false;
        if(userId){
            await insertAdViewCount(userId, ad.ad_id);
        }
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
            wishListed: ad.wishListed,
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
                    return {
                        id: image.id,
                        ad_id: image.ad_id,
                        image: image.image ? await getImageUrl(image.image) : null,
                        createdAt: image.createdAt.toISOString(),
                        updatedAt: image.updatedAt.toISOString()
                    }
                })),
            ad_location: {
                id: ad.ad_location.id,
                ad_id: ad.ad_location.ad_id,
                locality: ad.ad_location.locality??'',
                place: ad.ad_location.place??'',
                district: ad.ad_location.district??'',
                state: ad.ad_location.state??'',
                country: ad.ad_location.country??'',
                longitude: `${ad.ad_location.longitude}`,
                latitude: `${ad.ad_location.latitude}`,
                createdAt: ad.ad_location.createdAt.toISOString(),
                updatedAt: ad.ad_location.updatedAt.toISOString()
            },
            user: {
                id: ad.user.id,
                user_id: ad.user.user_id,
                // is_guest: ad.user.is_guest,
                name: ad.user.name,
                email: ad.user.email,
                email_uid: ad.user.email_uid,
                mobile_number: ad.user.mobile_number,
                profile: ad.user.profile ? await getImageUrl(ad.user.profile) : null,
                description: ad.user.description,
                notification_token: ad.user.notification_token
            }
        };
        res.status(200).json(response);
    } catch (error) {        
        res.status(500).json({ message: 'Server error' });
    }
};

exports.myAds = async (req, res) => {
    try {
        const userId = req.user.id;
        const ads = await Ad.findAll({
            where: { user_id: userId, ad_stage: 3 },
            attributes: {
                include: [
                    [literal(`(SELECT COUNT(*) FROM ad_wish_lists WHERE ad_wish_lists.ad_id = Ad.ad_id)`), 'ad_wish_lists_count'],
                    [literal(`(SELECT COUNT(*) FROM ad_views WHERE ad_views.ad_id = Ad.ad_id)`), 'ad_views_count'],
                ]
            },
            include: [
                { model: User, as: 'user' },
                { model: AdImage, as: 'ad_images' },
                { model: AdLocation, as: 'ad_location' },
                { model: AdPriceDetails, as: 'ad_price_details' },
            ],
            nest: true
        });
        const formattedAds = await Promise.all(
            ads.map(async (ad) => {
                return {
                    "id": ad.dataValues.id,
                    "ad_id": ad.dataValues.ad_id,
                    "user_id": ad.dataValues.user_id,
                    "title": ad.dataValues.title,
                    "category": ad.dataValues.category,
                    "description": ad.dataValues.description,
                    "ad_type": ad.dataValues.ad_type,
                    "ad_status": ad.dataValues.ad_status,
                    "ad_stage": ad.dataValues.ad_stage,
                    "createdAt": ad.dataValues.createdAt.toISOString(),
                    "updatedAt": ad.dataValues.updatedAt.toISOString(),
                    "ad_wish_lists_count": ad.dataValues.ad_wish_lists_count,
                    "ad_views_count": ad.dataValues.ad_views_count,
                    "user": ad.dataValues.user ? {
                        "id": ad.dataValues.user.id,
                        "user_id": ad.dataValues.user.user_id,
                        // "is_guest": ad.dataValues.user.is_guest,
                        "name": ad.dataValues.user.name,
                        "email": ad.dataValues.user.email,
                        "email_uid": ad.dataValues.user.email_uid,
                        "mobile_number": ad.dataValues.user.mobile_number,
                        "profile": ad.dataValues.user.profile ? await getImageUrl(ad.dataValues.user.profile) : null,
                        "description": ad.dataValues.user.description,
                        "notification_token": ad.dataValues.user.notification_token,
                        "token": ad.dataValues.user.token,
                        "createdAt": ad.dataValues.user.createdAt.toISOString(),
                        "updatedAt": ad.dataValues.user.updatedAt.toISOString()
                    } : null,
                    "ad_images": ad.dataValues.ad_images ? await Promise.all(
                        ad.dataValues.ad_images.map(async (image) => {
                            return {
                                "id": image.dataValues.id,
                                "ad_id": image.dataValues.ad_id,
                                "image": image.dataValues.image ? await getImageUrl(image.dataValues.image) : null,
                                "createdAt": image.dataValues.createdAt.toISOString(),
                                "updatedAt": image.dataValues.updatedAt.toISOString()
                            };
                        })
                    ) : [],
                    "ad_location": ad.dataValues.ad_location ? {
                        "id": ad.dataValues.ad_location.id,
                        "ad_id": ad.dataValues.ad_location.ad_id,
                        "locality": ad.dataValues.ad_location.locality??'',
                        "place": ad.dataValues.ad_location.place??'',
                        "district": ad.dataValues.ad_location.district??'',
                        "state": ad.dataValues.ad_location.state??'',
                        "country": ad.dataValues.ad_location.country??'',
                        "longitude": `${ad.dataValues.ad_location.longitude}`,
                        "latitude": `${ad.dataValues.ad_location.latitude}`,
                        "createdAt": ad.dataValues.ad_location.createdAt.toISOString(),
                        "updatedAt": ad.dataValues.ad_location.updatedAt.toISOString()
                    } : null,
                    "ad_price_details": ad.dataValues.ad_price_details ? ad.dataValues.ad_price_details.map(priceDetail => {
                        return {
                            "id": priceDetail.dataValues.id,
                            "ad_id": priceDetail.dataValues.ad_id,
                            "rent_duration": priceDetail.dataValues.rent_duration,
                            "rent_price": priceDetail.dataValues.rent_price,
                            "createdAt": priceDetail.dataValues.createdAt.toISOString(),
                            "updatedAt": priceDetail.dataValues.updatedAt.toISOString()
                        }
                    }) : []
                };
            }));
        res.status(200).json(formattedAds);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

const insertAdViewCount = async (userId, adId) => {
    try {
        let adView = await AdView.findOne({
            where: { user_id: userId, ad_id: adId }
        });
        if (!adView) {
            await AdView.create({
                user_id: userId,
                ad_id: adId,
                view_count: 1
            });
        } else {
            adView.view_count += 1;
            await adView.save();
        }
        return 'successfully updated';
    } catch (error) {
        throw new Error('Error updating ad view count'+error);
    }
};

exports.getRecentUnsavedPost = async (req, res) => {
    try {
        const userId = req.user.id;
        const ad = await Ad.findOne({
            where: {
                user_id: userId,
                ad_stage: {
                    [Op.lt]: 3,
                }
            },
            include: [
                { model: AdImage, as: 'ad_images' },
                { model: AdPriceDetails, as: 'ad_price_details' },
                { model: AdLocation, as: 'ad_location' }
            ],
            order: [['updatedAt', 'DESC']],
            nest: true,
        });
        let response = {}
        if (ad) {
            response = {
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
                ad_price_details: ad.ad_price_details ? ad.ad_price_details.map(priceDetail => ({
                    id: priceDetail.id,
                    ad_id: priceDetail.ad_id,
                    rent_duration: priceDetail.rent_duration,
                    rent_price: priceDetail.rent_price,
                    createdAt: priceDetail.createdAt.toISOString(),
                    updatedAt: priceDetail.updatedAt.toISOString()
                })) : [],
                ad_images: ad.ad_images ? await Promise.all(
                    ad.ad_images.map(async (image) => {
                        return {
                            id: image.id,
                            ad_id: image.ad_id,
                            image: image.image ? await getImageUrl(image.image) : null,
                            createdAt: image.createdAt.toISOString(),
                            updatedAt: image.updatedAt.toISOString()
                        }
                    })) : [],
                ad_location: ad.ad_location ? {
                    id: ad.ad_location.id,
                    ad_id: ad.ad_location.ad_id,
                    locality: ad.ad_location.locality??'',
                    place: ad.ad_location.place??'',
                    district: ad.ad_location.district??'',
                    state: ad.ad_location.state??'',
                    country: ad.ad_location.country??'',
                    longitude: `${ad.ad_location.longitude}`,
                    latitude: `${ad.ad_location.latitude}`,
                    createdAt: ad.ad_location.createdAt.toISOString(),
                    updatedAt: ad.ad_location.updatedAt.toISOString()
                } : null
            };
        }
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.searchCategories = async (req, res) => {
    try {
        const { keyword, ad_type } = req.body;
        if (!keyword || !ad_type) {
            return res.status(400).json({ message: 'Invalid request' });
        }
        const datas = await SearchCategory.findAll(
            {
                where: {
                    keyword: { [Op.like]: `%${keyword}%` },
                    ad_type
                }
            }
        );
        const result = datas.filter(data => data.keyword.toLowerCase().startsWith(keyword.toLowerCase()));
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.recommentedPosts = async (req, res) => {
    try {
        const page =parseInt(req.body.page);
        const perPage = 16;
        const offset = (page - 1) * perPage;
        let userSearches = [];
        if(req.body.id){
            userSearches = await UserSearch.findAll({
                where: {
                    user_id: req.body.id
                },
                order: [['createdAt', 'ASC']],
                limit: 2,
                raw: true,
                nest: true
            });
        }
        let adsQuery = {
            where: {
                ad_status: 'online',
                ad_type: "rent",
                ad_stage: 3
            },
            include: [
                { model: User, as: 'user' },
                { model: AdImage, as: 'ad_images' },
                { model: AdPriceDetails, as: 'ad_price_details' },
            ],
            distinct: true,
            limit: perPage,
            offset: offset,
        };
        if (req.body.id) {
            adsQuery.where.user_id = { [Op.ne]: req.body.id };
        }
        if (userSearches.length !== 0) {
            const firstSearch = userSearches[0];
            const hasLocationDetails = firstSearch.location && firstSearch.location_type && firstSearch.latitude !== null && firstSearch.longitude !== null;
            if (hasLocationDetails) {
                if (userSearches[0].location_type === 'locality' || userSearches[0].location_type === 'place') {
                    adsQuery.include.push({
                        model: AdLocation,
                        as: 'ad_location',
                        where: {
                            [Op.or]: [
                                { locality: userSearches[0].location },
                                { place: userSearches[0].location }
                            ]
                        }
                    });
                } else {
                    adsQuery.include.push({
                        model: AdLocation,
                        as: 'ad_location',
                        where: {
                            [Op.or]: [
                                { state: userSearches[0].location },
                                { country: userSearches[0].location }
                            ]
                        }
                    });
                }
                adsQuery.attributes = {
                    include: [
                        [
                            literal(`(
                                SELECT (6371 * 
                                    acos(cos(radians(${userSearches[0].latitude})) * cos(radians(ad_location.latitude)) * 
                                    cos(radians(ad_location.longitude) - radians(${userSearches[0].longitude})) + 
                                    sin(radians(${userSearches[0].latitude})) * sin(radians(ad_location.latitude)))
                                ) AS distance
                            )`), 'distance'
                        ],
                    ]
                };
                adsQuery.order = [
                    [sequelize.literal('distance'), 'ASC']
                ];
            } else {
                adsQuery.include.push({
                    model: AdLocation,
                    as: "ad_location"
                })
            }
        } else {
            adsQuery.include.push({
                model: AdLocation,
                as: "ad_location",
                required: true,
            })
            if(req.body.latitude && req.body.longitude){
                adsQuery.attributes = {
                    include: [
                        [
                            literal(`(
                                SELECT (6371 * 
                                    acos(cos(radians(${req.body.latitude})) * cos(radians(ad_location.latitude)) * 
                                    cos(radians(ad_location.longitude) - radians(${req.body.longitude})) + 
                                    sin(radians(${req.body.latitude})) * sin(radians(ad_location.latitude)))
                                ) AS distance
                            )`), 'distance'
                        ],
                    ]
                };
                adsQuery.order = [
                    [sequelize.literal('distance'), 'ASC']
                ];
            }
        }
       
        const { count, rows: ads } = await Ad.findAndCountAll(adsQuery);
        const totalPages = Math.ceil(count / perPage);
        const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl.split('?')[0]}`;
        const buildUrl = (pageNum) => `${fullUrl}?page=${pageNum}`;
        const response = {
            current_page: page,
            data: await Promise.all(
                ads.map(async (ad) => {
                    return {
                        id: ad.dataValues.ad_id,
                        ad_id: ad.dataValues.ad_id,
                        user_id: ad.dataValues.user_id,
                        title: ad.dataValues.title,
                        category: ad.dataValues.category,
                        description: ad.dataValues.description,
                        ad_type: ad.dataValues.ad_type,
                        ad_status: ad.dataValues.ad_status,
                        ad_stage: ad.dataValues.ad_stage,
                        distance: ad.dataValues.distance ? ad.dataValues.distance : null,
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
                                return {
                                    id: image.dataValues.id,
                                    ad_id: image.dataValues.ad_id,
                                    image: image.dataValues.image ? await getImageUrl(image.image) : null,
                                    createdAt: image.dataValues.createdAt.toISOString(),
                                    updatedAt: image.dataValues.updatedAt.toISOString()
                                }
                            })),
                        ad_location: {
                            id: ad.dataValues.ad_location.id,
                            ad_id: ad.dataValues.ad_location.ad_id,
                            locality: ad.dataValues.ad_location.locality??'',
                            place: ad.dataValues.ad_location.place??'',
                            district: ad.dataValues.ad_location.district??'',
                            state: ad.dataValues.ad_location.state??'',
                            country: ad.dataValues.ad_location.country??'',
                            longitude: `${ad.dataValues.ad_location.longitude}`,
                            latitude: `${ad.dataValues.ad_location.latitude}`,
                            createdAt: ad.dataValues.ad_location.createdAt.toISOString(),
                            updatedAt: ad.dataValues.ad_location.updatedAt.toISOString()
                        },
                    }
                }
                )),
            first_page_url: buildUrl(1),
            from: offset + 1,
            last_page: totalPages,
            last_page_url: buildUrl(totalPages),
            links: links = [
                {
                    url: page > 1 ? buildUrl(page - 1) : null,
                    label: "&laquo; Previous",
                    active: page > 1
                },
                {
                    url: buildUrl(page),
                    label: `${page}`,
                    active: true
                },
                {
                    url: page < totalPages ? buildUrl(page + 1) : null,
                    label: "Next &raquo;",
                    active: page < totalPages
                }
            ],
            next_page_url: page < totalPages ? buildUrl(page + 1) : null,
            path: fullUrl,
            per_page: perPage,
            prev_page_url: page > 1 ? buildUrl(page - 1) : null,
            to: Math.min(offset + perPage, count),
            total: count
        }
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getAllPosts = async (req, res) => {
    let posts = await Ad.findAll(
        {
            where: {
                ad_status: 'online',
                ad_type: "rent",
                ad_stage: 3
            },
            include: [
                { model: User, as: 'user' },
                { model: AdImage, as: 'ad_images' },
                { model: AdPriceDetails, as: 'ad_price_details' },
            ]
        }
    );
    res.status(200).json(posts);
}

exports.searchAds = async (req, res) => {   
    try {
        const { keyword, page = 1 } = req.body;
        if (!keyword) {
            return res.status(400).json({ message: 'Keyword is required' });
        }

        const perPage = 15;
        const offset = (page - 1) * perPage;

        let adsQuery = {
            where: {
                ad_status: 'online',
                ad_stage: 3
            },
            include: [
                { model: User, as: 'user' },
                { model: AdImage, as: 'ad_images' },
                { model: AdPriceDetails, as: 'ad_price_details' },
                { model: AdLocation, as: 'ad_location' }
            ],
            distinct: true,
            limit: perPage,
            offset: offset,
        };

        if (!isNaN(keyword)) {
            adsQuery.where.ad_id = Number(keyword);
        } else {
            adsQuery.where[Op.or] = [
                { title: { [Op.like]: `%${keyword}%` } },
                { category: { [Op.like]: `%${keyword}%` } },
                { description: { [Op.like]: `%${keyword}%` } }
            ];
        }

        const { count, rows: ads } = await Ad.findAndCountAll(adsQuery);
        const totalPages = Math.ceil(count / perPage);
        const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl.split('?')[0]}`;
        const buildUrl = (pageNum) => `${fullUrl}?page=${pageNum}`;

        const response = {
            current_page: page,
            data: await Promise.all(ads.map(async (ad) => ({
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
                ad_price_details: ad.ad_price_details.map(price => ({
                    id: price.id,
                    ad_id: price.ad_id,
                    rent_duration: price.rent_duration,
                    rent_price: price.rent_price,
                    createdAt: price.createdAt.toISOString(),
                    updatedAt: price.updatedAt.toISOString()
                })),
                ad_images: await Promise.all(ad.ad_images.map(async image => ({
                    id: image.id,
                    ad_id: image.ad_id,
                    image: image.image ? await getImageUrl(image.image) : null,
                    createdAt: image.createdAt.toISOString(),
                    updatedAt: image.updatedAt.toISOString()
                }))),
                ad_location: ad.ad_location ? {
                    id: ad.ad_location.id,
                    ad_id: ad.ad_location.ad_id,
                    locality: ad.ad_location.locality??'',
                    place: ad.ad_location.place??'',
                    district: ad.ad_location.district??'',
                    state: ad.ad_location.state??'',
                    country: ad.ad_location.country??'',
                    longitude: `${ad.ad_location.longitude}`,
                    latitude: `${ad.ad_location.latitude}`,
                    createdAt: ad.ad_location.createdAt.toISOString(),
                    updatedAt: ad.ad_location.updatedAt.toISOString()
                } : null
            }))),
            first_page_url: buildUrl(1),
            from: offset + 1,
            last_page: totalPages,
            last_page_url: buildUrl(totalPages),
            links: [
                {
                    url: page > 1 ? buildUrl(page - 1) : null,
                    label: "&laquo; Previous",
                    active: page > 1
                },
                {
                    url: buildUrl(page),
                    label: `${page}`,
                    active: true
                },
                {
                    url: page < totalPages ? buildUrl(page + 1) : null,
                    label: "Next &raquo;",
                    active: page < totalPages
                }
            ],
            next_page_url: page < totalPages ? buildUrl(page + 1) : null,
            path: fullUrl,
            per_page: perPage,
            prev_page_url: page > 1 ? buildUrl(page - 1) : null,
            to: Math.min(offset + perPage, count),
            total: count
        };

        res.status(200).json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.rentCategoryPosts = async (req, res) => {    
    try {
        const { ad_type, location_type, location, latitude, longitude, category, keyword, page = 1, user_id } = req.body;
        if (!ad_type) {
            return res.status(400).json({ message: 'Invalid request' });
        }
        const perPage = 15;
        const offset = (page - 1) * perPage;
        if(user_id){
            await UserSearch.create({
                user_id: user_id,
                keyword: req.body.keyword || '',
                category: req.body.category || '',
                ad_type: req.body.ad_type,
                location_type: req.body.location_type || '',
                location: req.body.location || '',
                latitude: req.body.latitude || null,
                longitude: req.body.longitude || null,
            })
        }
        let response;
        let adsQuery;
        const allAds = await Ad.findAll({ attributes: ['ad_id'] });
        const allAdIds = allAds.map(ad => ad.ad_id);
        if (keyword && allAdIds.includes(Number(keyword))) {            
            adsQuery = {
                where: {
                    ad_id: Number(keyword),
                    ad_stage: 3
                },
                include: [
                    { model: User, as: 'user' },
                    { model: AdImage, as: 'ad_images' },
                    { model: AdPriceDetails, as: 'ad_price_details' },
                    { model: AdLocation, as: 'ad_location' }
                ],
                distinct: true,
                limit: perPage,
                offset: offset,
            };
        } else if (!location_type || !location || !latitude || !longitude) {            
            adsQuery = {
                where: {
                    ad_type: ad_type,
                    ad_status: 'online',
                    ad_stage: 3
                },
                include: [
                    { model: User, as: 'user' },
                    { model: AdImage, as: 'ad_images' },
                    { model: AdPriceDetails, as: 'ad_price_details' },
                    { model: AdLocation, as: 'ad_location' }
                ],
                distinct: true,
                limit: perPage,
                offset: offset,
            };
            if (category) adsQuery.where.category = category;
            if (keyword) {                
                adsQuery.where[Op.or] = [
                    { category: { [Op.like]: `%${keyword}%` } },
                    { title: { [Op.like]: `%${keyword}%` } },
                    { description: { [Op.like]: `%${keyword}%` } },
                ];
            }
        } else {
            adsQuery = {
                where: {
                    ad_type: ad_type,
                    ad_status: 'online',
                    ad_stage: 3
                },
                attributes: {
                    include: [
                        [
                            literal(`(
                                SELECT (6371 * 
                                    acos(cos(radians(${latitude})) * cos(radians(ad_location.latitude)) * 
                                    cos(radians(ad_location.longitude) - radians(${longitude})) + 
                                    sin(radians(${latitude})) * sin(radians(ad_location.latitude)))
                                ) AS distance
                            )`), 'distance'
                        ],
                    ]
                },
                include: [
                    { model: User, as: 'user' },
                    { model: AdImage, as: 'ad_images' },
                    { model: AdPriceDetails, as: 'ad_price_details' },
                ],
                order: [
                    [sequelize.literal('distance'), 'ASC']
                ],
                distinct: true,
                limit: perPage,
                offset: offset,
            };
            if (category) adsQuery.where.category = category;
            if (keyword) {                
                adsQuery.where = {
                    ...adsQuery.where,
                    [Op.or]: [
                        { category: { [Op.like]: `%${keyword}%` } },
                        { title: { [Op.like]: `%${keyword}%` } },
                        { description: { [Op.like]: `%${keyword}%` } },
                    ]
                };
            }
            if (location_type === 'locality' || location_type === 'place') {
                adsQuery.include.push({
                    model: AdLocation,
                    as: 'ad_location',
                    where: {
                        [Op.or]: [
                            { locality: location },
                            { place: location }
                        ]
                    }
                });
            } else {
                adsQuery.include.push({
                    model: AdLocation,
                    as: 'ad_location',
                    where: {
                        [Op.or]: [
                            { state: location },
                            { country: location }
                        ]
                    }
                });
            }
        }
        const { count, rows: ads } = await Ad.findAndCountAll(adsQuery);
        
        const userId = user_id;
        let wishListAdIds;
        if(userId){
            const wishLists = await AdWishLists.findAll({
                where: { user_id: userId },
                attributes: ['ad_id']
            });
            wishListAdIds = wishLists.map(wishList => wishList.ad_id);
            ads.map(ad => {
                ad.wishListed = wishListAdIds.includes(ad.ad_id);
                if (ad.user) {
                    ad.user = ad.user.toJSON();
                    delete ad.user.token;
                }
            });
        }
        const totalPages = Math.ceil(count / perPage);
        const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl.split('?')[0]}`;
        const buildUrl = (pageNum) => `${fullUrl}?page=${pageNum}`;
        response = {
            current_page: page,
            data: await Promise.all(
                ads.map(async (ad) => {
                    return {
                        id: ad.dataValues.ad_id,
                        ad_id: ad.dataValues.ad_id,
                        user_id: ad.dataValues.user_id,
                        title: ad.dataValues.title,
                        category: ad.dataValues.category,
                        description: ad.dataValues.description,
                        ad_type: ad.dataValues.ad_type,
                        ad_status: ad.dataValues.ad_status,
                        ad_stage: ad.dataValues.ad_stage,
                        distance: ad.dataValues.distance ? ad.dataValues.distance : null,
                        createdAt: ad.dataValues.createdAt.toISOString(),
                        updatedAt: ad.dataValues.updatedAt.toISOString(),
                        wishListed: userId?wishListAdIds.includes(ad.dataValues.ad_id):false,
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
                                return {
                                    id: image.dataValues.id,
                                    ad_id: image.dataValues.ad_id,
                                    image: image.dataValues.image ? await getImageUrl(image.image) : null,
                                    createdAt: image.dataValues.createdAt.toISOString(),
                                    updatedAt: image.dataValues.updatedAt.toISOString()
                                }
                            })),
                        ad_location: {
                            id: ad.dataValues.ad_location.id,
                            ad_id: ad.dataValues.ad_location.ad_id,
                            locality: ad.dataValues.ad_location.locality??'',
                            place: ad.dataValues.ad_location.place??'',
                            district: ad.dataValues.ad_location.district??'',
                            state: ad.dataValues.ad_location.state??'',
                            country: ad.dataValues.ad_location.country??'',
                            longitude: `${ad.dataValues.ad_location.longitude}`,
                            latitude: `${ad.dataValues.ad_location.latitude}`,
                            createdAt: ad.dataValues.ad_location.createdAt.toISOString(),
                            updatedAt: ad.dataValues.ad_location.updatedAt.toISOString()
                        },
                    }
                }
                )),
            first_page_url: buildUrl(1),
            from: offset + 1,
            last_page: totalPages,
            last_page_url: buildUrl(totalPages),
            links: links = [
                {
                    url: page > 1 ? buildUrl(page - 1) : null,
                    label: "&laquo; Previous",
                    active: page > 1
                },
                {
                    url: buildUrl(page),
                    label: `${page}`,
                    active: true
                },
                {
                    url: page < totalPages ? buildUrl(page + 1) : null,
                    label: "Next &raquo;",
                    active: page < totalPages
                }
            ],
            next_page_url: page < totalPages ? buildUrl(page + 1) : null,
            path: fullUrl,
            per_page: perPage,
            prev_page_url: page > 1 ? buildUrl(page - 1) : null,
            to: Math.min(offset + perPage, count),
            total: count
        }
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.bestServiceProviders = async (req, res) => {
    try {
        const perPage = 10;
        const { location_type, location, latitude, longitude, page = 1, user_id } = req.body;        
        const offset = (page - 1) * perPage;
        const hasLocation = location_type && location && latitude && longitude;
        let adsQuery;
        if (hasLocation) {
            adsQuery = {
                where: {
                    ad_type: 'service',
                    ad_status: 'online',
                    user_id: { [Op.ne]: user_id },
                    ad_stage: 3
                },
                attributes: {
                    include: [
                        [literal(`(SELECT COUNT(*) FROM ad_wish_lists WHERE ad_wish_lists.ad_id = Ad.ad_id)`), 'ad_wish_lists_count'],
                        [literal(`(SELECT COUNT(*) FROM ad_views WHERE ad_views.ad_id = Ad.ad_id)`), 'ad_views_count'],
                        [
                            literal(`(
                                SELECT (6371 * 
                                    acos(cos(radians(${latitude})) * cos(radians(ad_location.latitude)) * 
                                    cos(radians(ad_location.longitude) - radians(${longitude})) + 
                                    sin(radians(${latitude})) * sin(radians(ad_location.latitude)))
                                ) AS distance
                            )`), 'distance'
                        ],
                    ]
                },
                include: [
                    { model: User, as: 'user' },
                    { model: AdImage, as: 'ad_images' },
                    { model: AdPriceDetails, as: 'ad_price_details' },
                ],
                order: [
                    [sequelize.literal('ad_wish_lists_count'), 'ASC'],
                    [sequelize.literal('ad_views_count'), 'ASC'],
                    [sequelize.literal('distance'), 'ASC'],
                ],
                distinct: true,
                limit: perPage,
                offset: offset,
            };
            if (user_id) {
                adsQuery.where.user_id = { [Op.ne]: user_id };
            }
            if (location_type === 'locality' || location_type === 'place') {
                adsQuery.include.push({
                    model: AdLocation,
                    as: 'ad_location',
                    where: {
                        [Op.or]: [
                            { locality: location },
                            { place: location }
                        ]
                    }
                });
            } else {
                adsQuery.include.push({
                    model: AdLocation,
                    as: 'ad_location',
                    where: {
                        [Op.or]: [
                            { state: location },
                            { country: location }
                        ]
                    }
                });
            }
        } else {
            adsQuery = {
                where: {
                    ad_type: 'service',
                    ad_status: 'online',
                    ad_stage: 3
                },
                attributes: {
                    include: [
                        [literal(`(SELECT COUNT(*) FROM ad_wish_lists WHERE ad_wish_lists.ad_id = Ad.ad_id)`), 'ad_wish_lists_count'],
                        [literal(`(SELECT COUNT(*) FROM ad_views WHERE ad_views.ad_id = Ad.ad_id)`), 'ad_views_count'],
                    ]
                },
                include: [
                    { model: User, as: 'user' },
                    { model: AdImage, as: 'ad_images' },
                    { model: AdPriceDetails, as: 'ad_price_details' },
                    {
                        model: AdLocation,
                        as: 'ad_location'
                    }
                ],
                order: [
                    [sequelize.literal('ad_wish_lists_count'), 'DESC'],
                    [sequelize.literal('ad_views_count'), 'DESC'],
                ],
                distinct: true,
                limit: perPage,
                offset: offset,
            };
            if (user_id) {
                adsQuery.where.user_id = { [Op.ne]: user_id };
            }
        }

        const { count, rows: ads } = await Ad.findAndCountAll(adsQuery);
        const totalPages = Math.ceil(count / perPage);
        const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl.split('?')[0]}`;
        const buildUrl = (pageNum) => `${fullUrl}?page=${pageNum}`;
        const response = {
            current_page: page,
            data: await Promise.all(
                ads.map(async (ad) => {
                    return {
                        id: ad.dataValues.ad_id,
                        ad_id: ad.dataValues.ad_id,
                        user_id: ad.dataValues.user_id,
                        title: ad.dataValues.title,
                        category: ad.dataValues.category,
                        description: ad.dataValues.description,
                        ad_type: ad.dataValues.ad_type,
                        ad_status: ad.dataValues.ad_status,
                        ad_stage: ad.dataValues.ad_stage,
                        ad_wish_lists_count: ad.dataValues.ad_wish_lists_count,
                        ad_views_count: ad.dataValues.ad_views_count,
                        distance: ad.dataValues.distance,
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
                                return {
                                    id: image.dataValues.id,
                                    ad_id: image.dataValues.ad_id,
                                    image: image.dataValues.image ? await getImageUrl(image.image) : null,
                                    createdAt: image.dataValues.createdAt.toISOString(),
                                    updatedAt: image.dataValues.updatedAt.toISOString()
                                }
                            })),
                        ad_location: {
                            id: ad.dataValues.ad_location.id,
                            ad_id: ad.dataValues.ad_location.ad_id,
                            locality: ad.dataValues.ad_location.locality??'',
                            place: ad.dataValues.ad_location.place??'',
                            district: ad.dataValues.ad_location.district??'',
                            state: ad.dataValues.ad_location.state??'',
                            country: ad.dataValues.ad_location.country??'',
                            longitude: `${ad.dataValues.ad_location.longitude}`,
                            latitude: `${ad.dataValues.ad_location.latitude}`,
                            createdAt: ad.dataValues.ad_location.createdAt.toISOString(),
                            updatedAt: ad.dataValues.ad_location.updatedAt.toISOString()
                        },
                    }
                }
                )),
            first_page_url: buildUrl(1),
            from: offset + 1,
            last_page: totalPages,
            last_page_url: buildUrl(totalPages),
            links: links = [
                {
                    url: page > 1 ? buildUrl(page - 1) : null,
                    label: "&laquo; Previous",
                    active: page > 1
                },
                {
                    url: buildUrl(page),
                    label: `${page}`,
                    active: true
                },
                {
                    url: page < totalPages ? buildUrl(page + 1) : null,
                    label: "Next &raquo;",
                    active: page < totalPages
                }
            ],
            next_page_url: page < totalPages ? buildUrl(page + 1) : null,
            path: fullUrl,
            per_page: perPage,
            prev_page_url: page > 1 ? buildUrl(page - 1) : null,
            to: Math.min(offset + perPage, count),
            total: count
        }
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.adCategoriesFor = async (req, res) => {
    try {
        const adCategoriesArray = []
        res.status(200).json(adCategoriesArray);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.addToWishlist = async (req, res) => {
    try {
        const { ad_id } = req.body;
        if (!ad_id) {
            return res.status(404).json({ message: 'Invalid request' });
        }
        const userId = req.user.id;
        const wishList = await AdWishLists.findOne({
            where: {
                ad_id: ad_id,
                user_id: userId
            }
        });
        if (wishList) {
            await wishList.destroy();
            return res.status(200).json({ success: true, message: 'Wishlist removed' });
        } else {
            await AdWishLists.create({
                user_id: userId,
                ad_id: ad_id
            });
            return res.status(200).json({ success: true, message: 'Wishlist added' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.changeOnlineStatus = async (req, res) => {
    try {
        const { ad_id } = req.body;
        if (!ad_id) {
            return res.status(400).json({ message: 'Invalid request' });
        }
        const ad = await Ad.findOne({ where: { ad_id } });
        if (!ad) {
            return res.status(404).json({ message: 'Ad not found' });
        }
        ad.ad_status = ad.ad_status === 'online' ? 'offline' : 'online';
        await ad.save();
        res.status(200).json({ message: `Ad status changed to ${ad.ad_status}` });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};