const AdCategory = require('../models/adCategoryModel');
const AdImage = require('../models/adImageModel');
const AdLocation = require('../models/adLocationModel');
const Ad = require('../models/adModel');
const AdPriceDetails = require('../models/adPriceDetailsModel');
const AdViews = require('../models/adViewModel');
const AdWishLists = require('../models/adWishListModel');
const ChatMessage = require('../models/chatMessageModel');
const ChatRoom = require('../models/chatRoomModel');
const ContactView = require('../models/contactViewModel');
const Otp = require('../models/otpModel');
const Place = require('../models/placeModel');
const PriceCategory = require('../models/priceCategoryModel');
const SearchCategory = require('../models/searchCategoryModel');
const User = require('../models/userModel');
const UserSearch = require('../models/userSearchModel');
const sequelize = require('../config/db');

exports.priceCategories = async (req, res) => {
  try {
    const priceCategories = await PriceCategory.findAll();
    const groupedCategories = priceCategories.reduce((group, item) => {
        const category = item.category;
        group[category] = group[category] || [];
        group[category].push(item);
        return group;
    }, {});
    res.status(200).json(groupedCategories);
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' });
  }
};
exports.addPriceCategories = async (req, res) => {
  try {
    const {category, title} = req.body;
    const priceCategories = await PriceCategory.findOne({where:{title:title,category:category}});
    if(priceCategories){
      return res.status(200).json({ message: 'Already Exist!' });
    }
    await PriceCategory.create({
      title:title,
      category:category
    })
    return res.status(200).json({ message: 'Success!' });
  } catch (error) {
    return res.status(500).json({ error: 'Something went wrong' });
  }
};
exports.deletePriceCategories = async (req,res)=>{
  try{
    const {category, title}=req.body;
    const priceCategories = await PriceCategory.findOne({where:{title:title,category:category}});
    if(!priceCategories){
      return res.status(200).json({ message: 'Nothing to delete!' });
    }
    await PriceCategory.destroy({where:{title:title,category:category}});
    return res.status(200).json({ message: 'Successfully Deleted!' });
  }catch(error){
    return res.status(500).json({ error: 'Something went wrong'+error });
  }
}

exports.clearDatabase = async (req, res)=>{
  try{
    // await AdLocation.destroy({where:{}});
    // await AdImage.destroy({where:{}});
    // await AdPriceDetails.destroy({where:{}});
    // await AdWishLists.destroy({where:{}});
    // await AdCategory.destroy({where:{}});
    // await AdViews.destroy({where:{}});
    // await Ad.destroy({where:{}});
    // await ContactView.destroy({where:{}});
    // await Otp.destroy({where:{}});
    // await Place.destroy({where:{}});
    // await SearchCategory.destroy({where:{}});
    // await UserSearch.destroy({where:{}});
    await ChatMessage.destroy({where:{}});
    await ChatRoom.destroy({where:{}});
    // await ChatMessage.drop();
    // await ChatRoom.drop();
    // await User.destroy({where:{}});
    // await sequelize.drop();
    return res.status(200).json({ message: 'Successfully Deleted!' });
  }catch(e){
    return res.status(500).json({ error: 'Something went wrong'+error });
  }
}