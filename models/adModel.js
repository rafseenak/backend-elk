const { Model, DataTypes, literal } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./userModel');

class Ad extends Model {
    // static withDistance(latitude, longitude) {
    //     return this.findAll({
    //         attributes: {
    //             include: [
    //                 [
    //                     literal(`(6371 * acos(cos(radians(${latitude})) * cos(radians(ad_locations.latitude)) 
    //                         * cos(radians(ad_locations.longitude) - radians(${longitude})) + sin(radians(${latitude})) 
    //                         * sin(radians(ad_locations.latitude))))`),
    //                     'distance'
    //                 ]
    //             ]
    //         },
    //         include: [{
    //             model: sequelize.models.AdLocation,
    //             attributes: []
    //         }],
    //         order: [[literal('distance'), 'ASC']]
    //     });
    // }
}

Ad.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true,
    },
    ad_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        unique: true
    },
    user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    category: {
        type: DataTypes.STRING,
        allowNull: false
    },
    description:{
        type: DataTypes.STRING,
        allowNull: false
    }, 
    ad_type: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ad_status: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ad_stage: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
}, {
    sequelize,
    modelName: 'Ad',
    tableName: 'ads',
    timestamps: true
});

Ad.belongsTo(User, {as: 'user', foreignKey: 'user_id', targetKey: 'user_id'});
User.hasMany(Ad, {as: 'ads', foreignKey: 'user_id',sourceKey: 'user_id' });

module.exports = Ad;
