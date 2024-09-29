const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class ChatRoom extends Model {}

ChatRoom.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  room_id:{
    type: DataTypes.BIGINT,
    allowNull: false,
    unique: true,
  },
  user1:{
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  user2:{
    type: DataTypes.BIGINT,
    allowNull: false,
  }
}, {
  sequelize,
  modelName: 'ChatRoom',
  tableName: 'chat_rooms',
  timestamps: true,
});

module.exports = ChatRoom;
