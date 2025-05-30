const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const adminController = require('../controllers/adminController');

const placeController = require('../controllers/placeController');
const postController = require('../controllers/postController');
const commonController = require('../controllers/commonController');
const chatController = require('../controllers/chatController');
const authenticateToken = require('../middlewares/authentication');
const multer = require('multer');
const upload = multer();
const User = require('../models/userModel');
//completed
//user
router.get('/create_guest', userController.createGuestUser);
router.post('/send_otp', userController.sendOtp);
router.post('/verify_otp', userController.verifyOtp);
router.post('/create_user', userController.createUser);
router.post('/get_user',authenticateToken, userController.getUserById);
router.post('/update_profile_pic',authenticateToken, upload.single('file'), userController.updateProfilePic);
router.post('/verify_update_mobile', authenticateToken, userController.verifyUpdateMobileOtp);
router.post('/update_email_or_mobile', authenticateToken, userController.updateEmailOrMobile);
router.post('/update_profile',
    authenticateToken,
    [
        body('name').isLength({ min: 3 }).withMessage('Name must be at least 3 characters long'),
        body('description').isLength({ min: 3 }).withMessage('Description must be at least 3 characters long')
    ],
    userController.updateProfile
);
router.post('/update_notification_token', authenticateToken, userController.updateNotificationToken);
router.get('/user_wishlists', authenticateToken, userController.userWishlists);
router.post('/add_to_wishlist',authenticateToken,postController.addToWishlist);
router.post('/remove_wishlist', authenticateToken, userController.removeWishlist);
router.post('/user_with_ads', authenticateToken, userController.userWithAds);
router.post('/view_contact', authenticateToken, userController.viewContact);
router.get('/view_contact',authenticateToken,userController.viewContact);
router.delete('/delete_account',authenticateToken,userController.deleteAccount);

router.get('/check-phone', async (req, res) => {
  try {
      const { mobile_number } = req.query;

      if (!mobile_number) {
          return res.status(400).json({ message: 'Mobile number is required' });
      }

      const user = await User.findOne({ where: { mobile_number } });

      if (user) {
          return res.status(200).json({ exists: true });
      }

      return res.status(200).json({ exists: false});
  } catch (error) {
      console.error('Error checking phone number:', error);
      return res.status(500).json({ message: 'Internal server error' });
  }
});
//place
router.post('/get_place', body('longitude').isNumeric(), body('latitude').isNumeric(), placeController.getPlace);
router.post('/place_search', placeController.placeSearch);
router.post('/get_places', body('type').isIn(['state', 'city', 'locality']), body('state').optional().notEmpty(), body('city').optional().notEmpty(), placeController.getPlaces);

//post
router.post('/create_post',authenticateToken,postController.createAd);
router.post('/upload_ad_image',authenticateToken, upload.array('files'),postController.updateAdImage);
router.post('/update_ad_address',authenticateToken,postController.updateAdAddress);
router.get('/my_ads',authenticateToken,postController.myAds);
router.post('/get_ad_details',postController.getAdDetails);
router.post('/delete_ad_image',authenticateToken,postController.deletAdImage);
router.post('/delete_ad',authenticateToken,postController.deleteAd);
router.get('/get_recent_unsaved_ad',authenticateToken,postController.getRecentUnsavedPost);
router.post('/change_online_status',authenticateToken,postController.changeOnlineStatus);
router.post('/recomented_posts',postController.recommentedPosts);
router.post('/rent_category_posts',postController.rentCategoryPosts);
router.post('/categories_search',postController.searchCategories);
router.post('/best_service_providers',postController.bestServiceProviders);
router.post('/search_ad',postController.searchAds);
//chat
router.post('/add_chat',authenticateToken,chatController.addChat);
router.get('/get_chat', chatController.getChatMessages);
router.get('/chat_rooms', chatController.getChatRooms);
router.get('/unread_chat_room_count', chatController.getTotalChatRoomsCount);
router.post('/block_user',chatController.blockAUser);
router.post('/unblock_user',chatController.unblockAUser);
router.get('/is_blocked',chatController.isUserBlocked);

//common
router.get('/price_categories',commonController.priceCategories);
router.post('/add_price_categories',commonController.addPriceCategories);
router.delete('/delete_price_categories',commonController.deletePriceCategories);
router.post('/ad_catergories_for',authenticateToken,postController.adCategoriesFor);
router.delete('/clear_all',commonController.clearDatabase);
router.post('/send_token_notification',()=>{});

const BlockedUser = require('../models/blockedUserModel');

router.get('/blocked-users', async (req, res) => {
    try {
      const blockedUsers = await BlockedUser.findAll();
      res.status(200).json(blockedUsers);
    } catch (error) {
      console.error("Error fetching blocked users:", error);
      res.status(500).json({ message: "An error occurred while fetching blocked users" });
    }
});

router.get('/get-all-users', async (req, res) => {
    try {
      const blockedUsers = await User.findAll();
      res.status(200).json(blockedUsers);
    } catch (error) {
      console.error("Error fetching blocked users:", error);
      res.status(500).json({ message: "An error occurred while fetching blocked users" });
    }
});

router.get('/get-admin-ads', adminController.getAdminAds);
router.delete('/delete-ad', adminController.deleteAdminAd);
router.get('/get-ad-locations', adminController.getAllAdLocations)
router.get('/get-users', adminController.getAllUsers);
router.put('/block_user', adminController.blockUserById);


module.exports = router;