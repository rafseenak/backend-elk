const { where } = require('sequelize');
const PriceCategory = require('../models/priceCategoryModel');

exports.priceCategories = async (req, res) => {
  try {
    const priceCategories = await PriceCategory.findAll();
    const groupedCategories = priceCategories.reduce((group, item) => {
        const category = item.category;
        group[category] = group[category] || [];
        group[category].push(item);
        return group;
    }, {});
    res.json(groupedCategories);
  } catch (error) {
    res.status(500).json({ error: 'Something went wrong' });
  }
};
exports.addPriceCategories = async (req, res) => {
  try {
    const {category, title} = req.body;
    // const priceCategories = await PriceCategory.findAll({where:{title:title,category:category}});
    // if(priceCategories){
    //   return res.status(200).json({ message: 'Already Exist!' });
    // }
    await PriceCategory.create({
      title:title,
      category:category
    })
    return res.status(200).json({ message: 'Success!' });
  } catch (error) {
    return res.status(500).json({ error: 'Something went wrong' });
  }
};